-- Juros por atraso na despesa fixa.
--
-- Kawa, 23/09/2026: "tem alguns gastos fixos que ele paga juros por atraso.
-- Supondo que 200 virem 210 por juros... gastos fixos quando editados tem que ir
-- para uma categoria automaticamente chamada de Juros." E depois: "o juros vai
-- ser 10 nesse caso. E essa parte de colocar juros e apenas em gastos fixos."
--
-- A despesa fixa do mes guarda o valor dela (200). O que foi pago a mais (10)
-- vira uma despesa propria, ja paga, na categoria Juros, presa a fixa por
-- `juros_de_despesa_id`. Assim a categoria do seguro continua dizendo quanto
-- custa o seguro, e Juros diz quanto o atraso custou.
--
-- Idempotente: pode rodar de novo no SQL Editor sem efeito colateral.

alter table public.despesas
    add column if not exists juros_de_despesa_id bigint
        references public.despesas (id) on delete cascade;
comment on column public.despesas.juros_de_despesa_id is
    'Esta despesa e o juros pago pelo atraso daquela despesa fixa. Apagar a fixa apaga o juros.';

-- Uma fixa tem no maximo um lancamento de juros: editar de novo recalcula.
create unique index if not exists despesas_um_juros_por_despesa
    on public.despesas (juros_de_despesa_id) where juros_de_despesa_id is not null;

-- A categoria Juros nasce na primeira vez que for usada.
create or replace function public.categoria_juros()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_id bigint;
begin
    select c.id into v_id from public.categorias c
     where c.tipo = 'DESPESA' and lower(btrim(c.nome)) = 'juros'
     order by c.id limit 1;
    if v_id is null then
        insert into public.categorias (nome, tipo) values ('Juros', 'DESPESA') returning id into v_id;
    end if;
    return v_id;
end;
$$;
revoke all on function public.categoria_juros() from public, anon, authenticated;

-- Grava quanto foi pago de verdade numa despesa fixa lancada.
--  * Pago acima do valor da fixa: a fixa fica como esta e a diferenca vai para Juros.
--  * Pago igual ou abaixo: nao ha juros; abaixo, a propria fixa passa a esse valor.
-- Devolve o juros que ficou (0 quando nao ha).
create or replace function public.despesa_fixa_valor_pago(p_despesa_id bigint, p_valor numeric)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
    d public.despesas;
    v_juros numeric(12, 2);
begin
    perform public.exigir_administrador();

    select * into d from public.despesas where id = p_despesa_id for update;
    if not found then
        raise exception 'Despesa não encontrada.' using errcode = 'no_data_found';
    end if;
    if d.despesa_recorrente_id is null then
        raise exception 'Juros só se lança em despesa fixa.' using errcode = 'check_violation';
    end if;
    if p_valor is null or p_valor < 0 then
        raise exception 'Informe o valor pago.' using errcode = 'check_violation';
    end if;

    v_juros := greatest(round(p_valor, 2) - d.valor, 0);

    if v_juros = 0 then
        delete from public.despesas where juros_de_despesa_id = d.id;
        if p_valor < d.valor then
            update public.despesas set valor = round(p_valor, 2), atualizado_em = now() where id = d.id;
        end if;
        return 0;
    end if;

    update public.despesas
       set valor = v_juros,
           data_lancamento = d.data_lancamento,
           vencimento = d.vencimento,
           data_pagamento = coalesce(d.data_pagamento, d.data_lancamento),
           veiculo_id = d.veiculo_id,
           descricao = 'Juros — ' || d.descricao,
           atualizado_em = now()
     where juros_de_despesa_id = d.id;

    if not found then
        insert into public.despesas (
            descricao, categoria_id, valor, data_lancamento, vencimento, data_pagamento,
            veiculo_id, criado_por, status, aprovada, aprovado_por, aprovado_em, natureza,
            juros_de_despesa_id
        ) values (
            'Juros — ' || d.descricao, public.categoria_juros(), v_juros,
            d.data_lancamento, d.vencimento, coalesce(d.data_pagamento, d.data_lancamento),
            d.veiculo_id, (select auth.uid()), 'PAGO', true, (select auth.uid()), now(), 'GERAL',
            d.id
        );
    end if;

    return v_juros;
end;
$$;
revoke all on function public.despesa_fixa_valor_pago(bigint, numeric) from public, anon;
grant execute on function public.despesa_fixa_valor_pago(bigint, numeric) to authenticated;
