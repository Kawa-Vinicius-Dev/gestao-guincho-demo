-- A OP e da quinzena que a Porto declara, e nao do intervalo das OS dela.
--
-- Ate aqui o periodo da OP ia da primeira a ultima data de atendimento das OS
-- que ela trouxe. Os fins batiam com o calendario da Porto, os inicios nao: a OP
-- pode trazer servicos atrasados de outros meses, e um so desses esticava o
-- periodo inteiro. A 06427802 trouxe 13 servicos de 19/06 a 02/07, pagos em
-- agosto, e o seletor mostrava "19/06 a 13/08" — e, pior, somava na Visao geral
-- a receita de 8 OPs num periodo rotulado com 2.
--
-- Kawa corrigiu em 17/09/2026: "as ops sao divididas por quinzena". Cada OP tem,
-- na Porto, Data inicio e Data entrega, e elas nao seguem formula fixa:
--
--     06427803   01/08 a 14/08
--     06433185   15/08 a 28/08
--     06438807   01/09 a 16/09      (a 06438808 tambem)
--
-- Por isso ficam gravadas na OP. Quando informadas, o periodo da OP passa a ser
-- a quinzena; quando nao, continua o calculo antigo pelas OS, para nenhuma OP
-- ficar sem periodo. Onde a OS atrasada conta nao muda: conta na OP em que
-- entrou, que e a regra de ouro do modulo.

alter table public.ordens_pagamento_porto
    add column quinzena_inicio date,
    add column quinzena_entrega date,
    add constraint ops_quinzena_coerente check (
        quinzena_inicio is null or quinzena_entrega is null
        or quinzena_entrega >= quinzena_inicio);

comment on column public.ordens_pagamento_porto.quinzena_inicio is
    'Data inicio da OP como a Porto informa. Com a entrega, define o periodo da OP.';
comment on column public.ordens_pagamento_porto.quinzena_entrega is
    'Data entrega da OP como a Porto informa. E o fim do periodo da OP.';

create or replace function public.porto_recalcular_periodos()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    -- OP com a quinzena da Porto: o periodo e a quinzena, sem discussao.
    update public.ordens_pagamento_porto op
       set periodo_inicio = op.quinzena_inicio, periodo_fim = op.quinzena_entrega
     where op.quinzena_inicio is not null and op.quinzena_entrega is not null
       and (op.periodo_inicio is distinct from op.quinzena_inicio
            or op.periodo_fim is distinct from op.quinzena_entrega);

    -- Sem ela, o calculo de antes: da primeira a ultima OS da OP.
    with datas as (
        select os.ordem_pagamento_id as id,
               min(os.data_atendimento) as primeira,
               max(os.data_atendimento) as ultima
        from public.ordens_servico_porto os
        where os.ordem_pagamento_id is not null and os.data_atendimento is not null
        group by os.ordem_pagamento_id
    )
    update public.ordens_pagamento_porto op
       set periodo_inicio = d.primeira, periodo_fim = d.ultima
      from datas d
     where d.id = op.id
       and (op.quinzena_inicio is null or op.quinzena_entrega is null)
       and (op.periodo_inicio is distinct from d.primeira or op.periodo_fim is distinct from d.ultima);
end;
$$;
revoke execute on function public.porto_recalcular_periodos() from public, anon, authenticated;

-- Informar (ou corrigir) a quinzena de uma OP.
--
-- Mudar o periodo move o fim, e o fim e a data em que a receita, a conta a
-- receber e a comissao da OP sao lancadas. Por isso a funcao nao so grava: ela
-- refaz o fechamento da OP e ressincroniza as comissoes, no mesmo commit.
-- Passar as duas datas nulas volta a OP para o periodo calculado pelas OS.
create or replace function public.porto_definir_quinzena_op(
    p_op_id bigint, p_inicio date, p_entrega date
)
returns public.ordens_pagamento_porto
language plpgsql
security definer
set search_path = ''
as $$
declare v public.ordens_pagamento_porto;
begin
    perform public.exigir_administrador();

    if (p_inicio is null) <> (p_entrega is null) then
        raise exception 'Informe a data de início e a data de entrega da OP, ou nenhuma das duas.'
            using errcode = 'invalid_parameter_value';
    end if;
    if p_entrega < p_inicio then
        raise exception 'A data de entrega não pode ser anterior à data de início.'
            using errcode = 'invalid_parameter_value';
    end if;

    update public.ordens_pagamento_porto
       set quinzena_inicio = p_inicio, quinzena_entrega = p_entrega
     where id = p_op_id;
    if not found then
        raise exception 'Ordem de pagamento não encontrada.' using errcode = 'no_data_found';
    end if;

    perform public.porto_fechar_op(p_op_id);
    perform public.porto_sincronizar_comissoes();

    select * into v from public.ordens_pagamento_porto where id = p_op_id;
    return v;
end;
$$;
revoke execute on function public.porto_definir_quinzena_op(bigint, date, date) from public, anon;
grant execute on function public.porto_definir_quinzena_op(bigint, date, date) to authenticated;

-- A tela da OP precisa saber se a quinzena foi informada ou se o periodo ainda e
-- o calculado pelas OS: sem isso, o formulario de edicao mostraria "19/06 a
-- 13/08" como se fosse a quinzena, e salvar gravaria o erro como dado da Porto.
-- As duas colunas entram no fim da view, que e o que `create or replace` aceita.
create or replace view public.porto_ops_conciliadas with (security_invoker = true) as
 SELECT op.id,
    op.numero,
    op.valor_total,
    op.nome_codigo,
    op.data_pagamento_programada,
    op.valor_recebido,
    op.data_recebimento,
    op.periodo_inicio,
    op.periodo_fim,
    op.situacao_financeira,
    op.status_porto,
    op.observacao,
    op.calendario_pagamento_id,
    op.criado_em,
    op.atualizado_em,
    COALESCE(c.quantidade, 0::bigint) AS quantidade_ordens_servico,
    COALESCE(c.valor, 0::numeric) AS valor_ordens_servico,
    op.valor_total - COALESCE(c.valor, 0::numeric) AS divergencia,
        CASE
            WHEN op.valor_recebido IS NOT NULL AND abs(op.valor_recebido - op.valor_total) > 0.01 THEN 'RECEBIDA_COM_DIVERGENCIA'::text
            WHEN COALESCE(c.quantidade, 0::bigint) = 0 THEN 'SEM_COMPOSICAO'::text
            WHEN abs(op.valor_total - COALESCE(c.valor, 0::numeric)) <= 0.01 THEN 'CONCILIADA'::text
            WHEN (op.valor_total - COALESCE(c.valor, 0::numeric)) > 0::numeric THEN 'VALOR_ABAIXO'::text
            ELSE 'VALOR_ACIMA'::text
        END AS status_conciliacao,
    COALESCE(
        CASE
            WHEN op.periodo_inicio IS NOT NULL AND op.periodo_fim IS NOT NULL THEN (to_char(op.periodo_inicio::timestamp with time zone, 'DD/MM/YYYY'::text) || ' a '::text) || to_char(op.periodo_fim::timestamp with time zone, 'DD/MM/YYYY'::text)
            ELSE NULL::text
        END, cal.descricao) AS periodo_financeiro,
    op.quinzena_inicio,
    op.quinzena_entrega
   FROM ordens_pagamento_porto op
     LEFT JOIN ( SELECT ordens_servico_porto.ordem_pagamento_id,
            count(*) AS quantidade,
            sum(ordens_servico_porto.valor_total) AS valor
           FROM ordens_servico_porto
          WHERE ordens_servico_porto.ordem_pagamento_id IS NOT NULL
          GROUP BY ordens_servico_porto.ordem_pagamento_id) c ON c.ordem_pagamento_id = op.id
     LEFT JOIN calendario_pagamentos_porto cal ON cal.id = op.calendario_pagamento_id;

-- As quinzenas que Kawa informou em 17/09/2026, lidas da tela da Porto. A
-- migration roda como dono, sem sessao, entao grava direto e refaz o que a RPC
-- refaria: periodo, fechamento das OPs tocadas e comissoes.
update public.ordens_pagamento_porto op
   set quinzena_inicio = q.i, quinzena_entrega = q.e
  from (values ('06438807', date '2026-09-01', date '2026-09-16'),
               ('06438808', date '2026-09-01', date '2026-09-16'),
               ('06433185', date '2026-08-15', date '2026-08-28'),
               ('06427803', date '2026-08-01', date '2026-08-14')) q(numero, i, e)
 where op.numero = q.numero;

select public.porto_fechar_op(op.id)
  from public.ordens_pagamento_porto op
 where op.quinzena_inicio is not null;

select public.porto_sincronizar_comissoes();
