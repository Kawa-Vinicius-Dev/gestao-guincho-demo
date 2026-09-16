-- No painel, a OS acompanha a OP que a pagou.
--
-- Um servico de 30/03 pago na OP que fecha em 29/04 e producao de abril: foi em
-- abril que ele virou dinheiro, e e em abril que a comissao dele sai. Filtrar
-- pela data do atendimento espalharia a mesma OP por dois ou tres meses, e
-- nenhum recorte fecharia com o valor que a Porto pagou.
--
-- Enquanto nao ha OP, a data do atendimento e o que existe — e a OS aparece
-- como servico feito, aguardando pagamento.
do $$
declare
    v_nome text; v_def text; v_antes text; v_depois text;
    v_emendas text[][] := array[
        array['dashboard_financeiro',
            'from public.ordens_servico_porto os
        where os.data_atendimento between p_inicio and p_fim',
            'from public.ordens_servico_porto os
        left join public.ordens_pagamento_porto op on op.id = os.ordem_pagamento_id
        where coalesce(op.periodo_fim, os.data_atendimento) between p_inicio and p_fim'],
        array['porto_dashboard',
            'select * from public.ordens_servico_porto
        where (p_inicio is null or data_atendimento >= p_inicio)
          and (p_fim is null or data_atendimento <= p_fim)',
            'select os.* from public.ordens_servico_porto os
        left join public.ordens_pagamento_porto op on op.id = os.ordem_pagamento_id
        where (p_inicio is null or coalesce(op.periodo_fim, os.data_atendimento) >= p_inicio)
          and (p_fim is null or coalesce(op.periodo_fim, os.data_atendimento) <= p_fim)'],
        array['porto_resumo_ops',
            'where (p_inicio is null or data_pagamento_programada >= p_inicio)
          and (p_fim is null or data_pagamento_programada <= p_fim)',
            'where (p_inicio is null or coalesce(periodo_fim, data_pagamento_programada) >= p_inicio)
          and (p_fim is null or coalesce(periodo_fim, data_pagamento_programada) <= p_fim)'],
        array['resumo_porto_dashboard',
            'where data_pagamento_programada between p_inicio and p_fim',
            'where coalesce(periodo_fim, data_pagamento_programada) between p_inicio and p_fim'],
        -- "Comissao a repassar" perguntava se o ciclo que pagou a OS ja tinha
        -- tido repasse. Sem calendario, `calendario_pagamento_id` fica nulo e a
        -- condicao descartava todas as OS: o cartao mostraria zero devendo — o
        -- pior tipo de numero errado, o que parece uma boa noticia.
        array['dashboard_financeiro',
            'and op.calendario_pagamento_id is not null
          and not exists (
              select 1 from public.pagamentos_comissao pc
              where pc.motorista_id = os.motorista_id
                and pc.calendario_pagamento_id = op.calendario_pagamento_id
          )',
            'and not exists (
              select 1 from public.pagamentos_comissao pc
              where pc.motorista_id = os.motorista_id
                and pc.ordem_pagamento_id = op.id
          )']
    ];
    i int;
begin
    for i in 1 .. array_length(v_emendas, 1) loop
        v_nome := v_emendas[i][1];
        v_antes := v_emendas[i][2];
        v_depois := v_emendas[i][3];

        select pg_get_functiondef(p.oid) into v_def
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = v_nome;

        if v_def is null then
            raise exception 'funcao % nao encontrada', v_nome;
        end if;
        if position(v_antes in v_def) = 0 then
            raise exception 'trecho nao encontrado em %', v_nome;
        end if;

        execute replace(v_def, v_antes, v_depois);
    end loop;
end $$;

-- A view ganha o periodo da OP, que e o que a tela mostra no lugar do ciclo do
-- calendario. Coluna nova no meio obriga a recriar.
drop view if exists public.porto_ops_conciliadas;

create view public.porto_ops_conciliadas
with (security_invoker = true) as
select
    op.id, op.numero, op.valor_total, op.nome_codigo,
    op.data_pagamento_programada, op.valor_recebido, op.data_recebimento,
    op.periodo_inicio, op.periodo_fim,
    op.situacao_financeira, op.status_porto, op.observacao,
    op.calendario_pagamento_id, op.criado_em, op.atualizado_em,
    coalesce(c.quantidade, 0) as quantidade_ordens_servico,
    coalesce(c.valor, 0) as valor_ordens_servico,
    op.valor_total - coalesce(c.valor, 0) as divergencia,
    case
        when op.valor_recebido is not null
             and abs(op.valor_recebido - op.valor_total) > 0.01 then 'RECEBIDA_COM_DIVERGENCIA'
        when coalesce(c.quantidade, 0) = 0 then 'SEM_COMPOSICAO'
        when abs(op.valor_total - coalesce(c.valor, 0)) <= 0.01 then 'CONCILIADA'
        when op.valor_total - coalesce(c.valor, 0) > 0 then 'VALOR_ABAIXO'
        else 'VALOR_ACIMA'
    end as status_conciliacao,
    coalesce(
        case when op.periodo_inicio is not null and op.periodo_fim is not null
             then to_char(op.periodo_inicio, 'DD/MM/YYYY') || ' a ' || to_char(op.periodo_fim, 'DD/MM/YYYY')
        end,
        cal.descricao) as periodo_financeiro
from public.ordens_pagamento_porto op
left join (
    select ordem_pagamento_id, count(*) as quantidade, sum(valor_total) as valor
    from public.ordens_servico_porto where ordem_pagamento_id is not null
    group by ordem_pagamento_id
) c on c.ordem_pagamento_id = op.id
left join public.calendario_pagamentos_porto cal on cal.id = op.calendario_pagamento_id;

grant select on public.porto_ops_conciliadas to authenticated;

-- ---------------------------------------------------------------------------
-- O que falta para fechar o periodo
-- ---------------------------------------------------------------------------
-- Tres faltas impedem o fechamento, e todas nascem de onde o dado chega
-- incompleto: o painel do dia traz o acionamento sem valor, porque a Porto so
-- precifica na OP; o relatorio da OP traz a coluna de viatura sempre vazia; e o
-- QRA nem sempre casa com alguem do cadastro. Ficam na mesma lista porque quem
-- opera resolve as tres na mesma sentada.
--
-- Sempre dentro do periodo escolhido. Um ano inteiro de pendencias numa tela so
-- nao e uma tela de trabalho, e sim um relatorio que ninguem termina.
create or replace function public.porto_pendencias_os(p_inicio date, p_fim date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare v jsonb;
begin
    perform public.exigir_administrador();

    select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id,
        'numeroOs', t.numero,
        'dataAtendimento', t.data_atendimento,
        'seguradora', t.seguradora,
        'especialidade', t.especialidade,
        'siglaViatura', t.sigla_viatura,
        'socorrista', t.socorrista,
        'motoristaId', t.motorista_id,
        'valorTotal', t.valor_total,
        'numeroOp', t.numero_op,
        'semValor', t.valor_total = 0,
        'semSocorrista', t.motorista_id is null,
        'semViatura', coalesce(btrim(t.sigla_viatura), '') = ''
    ) order by t.data_atendimento, t.numero), '[]'::jsonb) into v
    from (
        select os.id, os.numero, os.data_atendimento, os.seguradora, os.especialidade,
               os.sigla_viatura, os.socorrista, os.motorista_id, os.valor_total,
               op.numero as numero_op
        from public.ordens_servico_porto os
        left join public.ordens_pagamento_porto op on op.id = os.ordem_pagamento_id
        where coalesce(op.periodo_fim, os.data_atendimento) between p_inicio and p_fim
          -- Servico cancelado nao tem o que resolver: nao houve atendimento.
          and os.status_operacional <> 'CANCELADO'
          and (os.valor_total = 0
               or os.motorista_id is null
               or coalesce(btrim(os.sigla_viatura), '') = '')
    ) t;

    return v;
end;
$$;

-- Acerto em lote: a tela manda o que foi digitado e o banco aplica tudo junto.
-- Uma chamada por linha faria dezenas de idas para uma sentada de trabalho.
create or replace function public.porto_resolver_pendencias(p_itens jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_item jsonb;
    v_id bigint;
    v_valor numeric;
    v_motorista bigint;
    v_sigla text;
    v_total integer := 0;
begin
    perform public.exigir_administrador();

    for v_item in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) loop
        v_id := (v_item ->> 'id')::bigint;
        v_valor := nullif(v_item ->> 'valorTotal', '')::numeric;
        v_motorista := nullif(v_item ->> 'motoristaId', '')::bigint;
        v_sigla := nullif(btrim(coalesce(v_item ->> 'siglaViatura', '')), '');

        if v_valor is not null and v_valor < 0 then
            raise exception 'Valor negativo na OS %.', v_id
                using errcode = 'invalid_parameter_value';
        end if;

        update public.ordens_servico_porto os
           set valor_total = coalesce(v_valor, os.valor_total),
               sigla_viatura = coalesce(v_sigla, os.sigla_viatura),
               motorista_id = coalesce(v_motorista, os.motorista_id),
               -- Vinculo escolhido a mao nao pode ser desfeito pela proxima
               -- importacao, que so tem o QRA para adivinhar.
               motorista_vinculo_manual = os.motorista_vinculo_manual or v_motorista is not null
         where os.id = v_id
           -- O valor de servico ja pago vem da OP; a tela nao reescreve caixa.
           and (v_valor is null or os.status_financeiro <> 'RECEBIDO');

        if found then v_total := v_total + 1; end if;
    end loop;

    return v_total;
end;
$$;

revoke execute on function public.porto_pendencias_os(date, date) from public, anon;
revoke execute on function public.porto_resolver_pendencias(jsonb) from public, anon;
grant execute on function public.porto_pendencias_os(date, date) to authenticated;
grant execute on function public.porto_resolver_pendencias(jsonb) to authenticated;
