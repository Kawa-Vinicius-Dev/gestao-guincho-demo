-- Despesa fixa com parcelas: conta sozinha e encerra na ultima.
--
-- Kawa, 22/09/2026, com a planilha do cliente: "SEGURO DOS CAMINHOES 3/10",
-- "PARCELA DO CAMINHAO (VW L168) 49/58". A fixa ganha a parcela de onde comeca
-- e o total. Cada lancamento do mes grava o numero da parcela na despesa e usa a
-- proxima livre — apagar um lancamento e lancar de novo nao pula numero. Depois
-- da ultima, a fixa se desativa sozinha. Sem total, a fixa nao tem fim (IPTU,
-- contador), como sempre foi.
--
-- Idempotente: pode rodar de novo no SQL Editor sem efeito colateral.

alter table public.despesas_recorrentes
    add column if not exists total_parcelas integer,
    add column if not exists parcela_inicial integer;
alter table public.despesas_recorrentes
    drop constraint if exists despesas_recorrentes_parcelas_validas;
alter table public.despesas_recorrentes
    add constraint despesas_recorrentes_parcelas_validas check (
        (total_parcelas is null and parcela_inicial is null)
        or (total_parcelas >= 1 and parcela_inicial between 1 and total_parcelas));
comment on column public.despesas_recorrentes.total_parcelas is
    'Quantas parcelas ao todo (ex.: 10 em 3/10). Vazio: fixa sem fim.';
comment on column public.despesas_recorrentes.parcela_inicial is
    'A parcela do primeiro lancamento feito pelo sistema (ex.: 3 em 3/10).';

alter table public.despesas
    add column if not exists parcela_numero integer,
    add column if not exists parcela_total integer;
comment on column public.despesas.parcela_numero is
    'Qual parcela da despesa fixa esta despesa e (ex.: 4 em 4/10).';

-- A proxima parcela a lancar. Funcao sobre a linha, para a tela pedir junto com
-- a lista (`select=...,proxima_parcela`) sem uma consulta por fixa.
create or replace function public.proxima_parcela(f public.despesas_recorrentes)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
    select case when f.total_parcelas is null then null else
        coalesce((select max(d.parcela_numero) from public.despesas d
                   where d.despesa_recorrente_id = f.id), f.parcela_inicial - 1) + 1 end
$$;
grant execute on function public.proxima_parcela(public.despesas_recorrentes) to authenticated;

create or replace function public.lancar_despesas_recorrentes(p_mes date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_inicio date := date_trunc('month', p_mes)::date;
    v_fim date := (date_trunc('month', p_mes) + interval '1 month - 1 day')::date;
    v_lancadas integer := 0;
    v_ja_existiam integer := 0;
    v_encerradas integer := 0;
    v_valor numeric := 0;
    v_quem uuid := (select auth.uid());
    r public.despesas_recorrentes;
    v_vencimento date;
    v_parcela integer;
begin
    perform public.exigir_administrador();

    for r in
        select * from public.despesas_recorrentes where ativo
    loop
        v_vencimento := least(
            (v_inicio + (r.dia_vencimento - 1) * interval '1 day')::date,
            v_fim
        );

        if exists (
            select 1 from public.despesas d
            where d.despesa_recorrente_id = r.id
              and d.data_lancamento between v_inicio and v_fim
        ) then
            v_ja_existiam := v_ja_existiam + 1;
            continue;
        end if;

        v_parcela := public.proxima_parcela(r);
        -- Todas as parcelas ja foram lancadas: a fixa acabou.
        if v_parcela is not null and v_parcela > r.total_parcelas then
            update public.despesas_recorrentes set ativo = false where id = r.id;
            v_encerradas := v_encerradas + 1;
            continue;
        end if;

        insert into public.despesas (
            descricao, categoria_id, valor, data_lancamento, vencimento,
            veiculo_id, motorista_id, observacoes, despesa_recorrente_id,
            criado_por, status, aprovada, parcela_numero, parcela_total
        ) values (
            r.descricao || case when v_parcela is null then ''
                               else ' (' || v_parcela || '/' || r.total_parcelas || ')' end,
            r.categoria_id, r.valor, v_inicio, v_vencimento,
            r.veiculo_id, r.motorista_id, r.observacoes, r.id,
            v_quem, 'PENDENTE', false, v_parcela, r.total_parcelas
        );

        v_lancadas := v_lancadas + 1;
        v_valor := v_valor + r.valor;

        -- Era a ultima: encerra ja, para nao aparecer como ativa no mes seguinte.
        if v_parcela is not null and v_parcela = r.total_parcelas then
            update public.despesas_recorrentes set ativo = false where id = r.id;
            v_encerradas := v_encerradas + 1;
        end if;
    end loop;

    return jsonb_build_object(
        'mes', to_char(v_inicio, 'YYYY-MM'),
        'lancadas', v_lancadas,
        'jaExistiam', v_ja_existiam,
        'encerradas', v_encerradas,
        'valorLancado', v_valor
    );
end;
$$;
