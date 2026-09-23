-- Despesas fixas entram sozinhas, e o socorrista so lanca o que o administrador libera.
--
-- Kawa, 23/09/2026:
--  * "despesas recorrentes, sobre seguros das viaturas, essas coisas, para eu nao
--    precisar colocar todos os meses esse valor". A fixa entra sozinha, ja paga,
--    no dia do vencimento de cada mes, com o valor cadastrado. Se num mes o valor
--    for outro, edita-se aquela despesa.
--  * "quando o socorrista for colocar uma despesa, nao e para aparecer todas as
--    despesas possiveis, e apenas aquilo que o administrador permitir."
--  * A comissao padrao aparecia vazia em Configuracoes: a tabela nova ficou sem
--    permissao de leitura para quem esta logado.
--
-- Idempotente: pode rodar de novo no SQL Editor sem efeito colateral.

-- ---------------------------------------------------------------- comissao padrao
grant select on public.configuracao_comissao to authenticated;

-- ---------------------------------------------------------------- categorias do socorrista
alter table public.categorias
    add column if not exists socorrista_pode boolean not null default false;
comment on column public.categorias.socorrista_pode is
    'O socorrista pode lancar despesa nesta categoria. Quem libera e o administrador.';

-- Categoria da rua nasce liberada: e o que o socorrista gasta em servico.
-- Seguro, parcela, imposto e comissao nascem so do administrador. Depois de
-- criada, quem decide e a tela (Configuracoes > Categorias).
create or replace function public.categoria_da_rua(p_nome text)
returns boolean language sql immutable set search_path = '' as $$
    select lower(btrim(p_nome)) in ('combustível', 'combustivel', 'pedágio', 'pedagio',
                                    'alimentação', 'alimentacao', 'manutenção', 'manutencao')
$$;

create or replace function public.categoria_nasce_liberada()
returns trigger language plpgsql set search_path = '' as $$
begin
    if new.tipo = 'DESPESA' and public.categoria_da_rua(new.nome) then
        new.socorrista_pode := true;
    end if;
    return new;
end;
$$;
drop trigger if exists categorias_nasce_liberada on public.categorias;
create trigger categorias_nasce_liberada
    before insert on public.categorias
    for each row execute function public.categoria_nasce_liberada();

-- As que ja existem: so na primeira vez, para nao desfazer o que a tela decidiu.
do $$
begin
    if not exists (select 1 from public.categorias where socorrista_pode) then
        update public.categorias set socorrista_pode = true
         where tipo = 'DESPESA' and public.categoria_da_rua(nome);
    end if;
end $$;

-- A tela esconde o que nao esta liberado; o banco recusa, para a regra nao
-- depender da tela. Quem roda como sistema (sincronizacao de comissao, fixas
-- automaticas) nao passa por aqui.
create or replace function public.despesa_em_categoria_liberada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if (select auth.uid()) is null
       or public.e_administrador()
       or coalesce(current_setting('fluxo.sincronizando_comissoes', true), 'off') = 'on' then
        return new;
    end if;
    if not exists (select 1 from public.categorias c
                    where c.id = new.categoria_id and c.socorrista_pode and c.ativo) then
        raise exception 'Esta categoria não está liberada para o socorrista.'
            using errcode = 'insufficient_privilege';
    end if;
    return new;
end;
$$;

drop trigger if exists despesas_categoria_do_socorrista on public.despesas;
create trigger despesas_categoria_do_socorrista
    before insert on public.despesas
    for each row execute function public.despesa_em_categoria_liberada();

-- ---------------------------------------------------------------- fixas automaticas
-- Lanca, ja paga, cada fixa ativa cujo vencimento deste mes ja chegou e que
-- ainda nao foi lancada no mes. Rodar de novo nao duplica. Parcelas seguem a
-- mesma conta de antes: grava o numero e encerra a fixa na ultima.
create or replace function public.lancar_fixas_vencidas(p_hoje date default current_date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_inicio date := date_trunc('month', p_hoje)::date;
    v_fim date := (date_trunc('month', p_hoje) + interval '1 month - 1 day')::date;
    v_quem uuid;
    v_lancadas integer := 0;
    v_vencimento date;
    v_parcela integer;
    r public.despesas_recorrentes;
begin
    -- Chamada pela tela: so o administrador. Pelo agendador do banco: sem usuario.
    if (select auth.uid()) is not null then
        perform public.exigir_administrador();
    end if;

    v_quem := coalesce((select auth.uid()),
        (select p.id from public.perfis p where p.perfil = 'ADMINISTRADOR' and p.ativo
          order by p.criado_em limit 1));

    for r in select * from public.despesas_recorrentes where ativo loop
        v_vencimento := least((v_inicio + (r.dia_vencimento - 1) * interval '1 day')::date, v_fim);
        continue when v_vencimento > p_hoje;
        continue when exists (
            select 1 from public.despesas d
             where d.despesa_recorrente_id = r.id
               and (d.data_lancamento between v_inicio and v_fim
                    or d.vencimento between v_inicio and v_fim));

        v_parcela := public.proxima_parcela(r);
        if v_parcela is not null and v_parcela > r.total_parcelas then
            update public.despesas_recorrentes set ativo = false where id = r.id;
            continue;
        end if;

        insert into public.despesas (
            descricao, categoria_id, valor, data_lancamento, vencimento, data_pagamento,
            veiculo_id, motorista_id, observacoes, despesa_recorrente_id,
            criado_por, status, aprovada, aprovado_por, aprovado_em, natureza,
            parcela_numero, parcela_total
        ) values (
            r.descricao || case when v_parcela is null then ''
                               else ' (' || v_parcela || '/' || r.total_parcelas || ')' end,
            r.categoria_id, r.valor, v_vencimento, v_vencimento, v_vencimento,
            r.veiculo_id, r.motorista_id, r.observacoes, r.id,
            v_quem, 'PAGO', true, v_quem, now(), 'GERAL',
            v_parcela, r.total_parcelas
        );
        v_lancadas := v_lancadas + 1;

        if v_parcela is not null and v_parcela = r.total_parcelas then
            update public.despesas_recorrentes set ativo = false where id = r.id;
        end if;
    end loop;

    return v_lancadas;
end;
$$;
revoke execute on function public.lancar_fixas_vencidas(date) from public, anon;
grant execute on function public.lancar_fixas_vencidas(date) to authenticated;

-- Todo dia as 06:15 de Brasilia (09:15 UTC). A tela de Despesas tambem chama a
-- funcao ao abrir: se o agendador falhar um dia, a primeira visita acerta.
-- So onde o pg_cron existe (no Supabase, sim; no Postgres dos testes, nao).
do $$
begin
    if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
        raise notice 'pg_cron indisponivel: as fixas entram quando a tela de Despesas abre.';
        return;
    end if;
    create extension if not exists pg_cron;
    execute $cron$
        select cron.unschedule(jobid) from cron.job where jobname = 'lancar-fixas-vencidas'
    $cron$;
    execute $cron$
        select cron.schedule('lancar-fixas-vencidas', '15 9 * * *', 'select public.lancar_fixas_vencidas()')
    $cron$;
end $$;

-- As deste mes que ja venceram entram agora.
select public.lancar_fixas_vencidas();
