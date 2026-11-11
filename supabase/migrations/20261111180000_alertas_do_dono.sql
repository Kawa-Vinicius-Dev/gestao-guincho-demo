-- Alertas do dono: o que precisa de atencao hoje, numa chamada so.
--
-- Serve a quem consulta por fora da tela (aviso por agendamento no n8n, resumo
-- semanal, assistente): em vez de cada automacao reescrever "o que esta atrasado",
-- a regra mora aqui, uma vez, com as definicoes que o sistema ja usa:
--   conta a receber atrasada  vencimento < hoje e status PENDENTE/ATRASADO
--   despesa vencida           aprovada, PENDENTE/ATRASADO e vencimento < hoje
--   OP atrasada               nao RECEBIDO e pagamento programado < hoje
--   documento                 vence_em vencido ou nos proximos p_dias_documento dias
--   turno aberto ha muito     ABERTO ha mais de p_horas_turno horas
--   para aprovar              turno AGUARDANDO_APROVACAO; despesa nao aprovada e nao rejeitada
--
-- So le, e so o administrador chama (como o dashboard_financeiro). Devolve uma linha
-- por tipo que tenha algo; tipo sem ocorrencia nao aparece. `itens` traz no maximo
-- 10 exemplos, os mais antigos primeiro, para a mensagem citar sem virar relatorio.
-- Hoje e o de Sao Paulo, como no resto do sistema.
create or replace function public.alertas_do_dono(
    p_dias_documento integer default 30,
    p_horas_turno integer default 12
) returns table (
    tipo text,
    gravidade text,
    quantidade integer,
    valor_total numeric,
    resumo text,
    itens jsonb
)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
declare
    v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
    perform public.exigir_administrador();
    if p_dias_documento is null or p_dias_documento < 0 or p_dias_documento > 365 then
        raise exception 'p_dias_documento deve estar entre 0 e 365' using errcode = 'invalid_parameter_value';
    end if;
    if p_horas_turno is null or p_horas_turno < 1 or p_horas_turno > 72 then
        raise exception 'p_horas_turno deve estar entre 1 e 72' using errcode = 'invalid_parameter_value';
    end if;

    return query
    with contas as (
        select cr.id, cr.descricao, c.nome as contratante, cr.vencimento, cr.valor_previsto as valor
          from public.contas_receber cr
          left join public.contratantes c on c.id = cr.contratante_id
         where cr.vencimento < v_hoje and cr.status in ('PENDENTE', 'ATRASADO')
    ),
    despesas_vencidas as (
        select d.id, d.descricao, d.vencimento, d.valor
          from public.despesas d
         where d.aprovada and d.status in ('PENDENTE', 'ATRASADO') and d.vencimento < v_hoje
    ),
    despesas_a_aprovar as (
        select d.id, d.descricao, d.data_lancamento, d.valor
          from public.despesas d
         where not d.aprovada and d.status <> 'REJEITADO'
    ),
    ops as (
        select o.id, o.numero, o.data_pagamento_programada as programado, o.valor_total as valor
          from public.ordens_pagamento_porto o
         where o.situacao_financeira <> 'RECEBIDO' and o.data_pagamento_programada < v_hoje
    ),
    docs as (
        select x.id, x.tipo, coalesce(v.identificacao, m.nome) as dono, x.vence_em
          from public.documentos x
          left join public.veiculos v on v.id = x.veiculo_id
          left join public.motoristas m on m.id = x.motorista_id
         where x.vence_em <= v_hoje + p_dias_documento
    ),
    turnos_longos as (
        select t.id, m.nome as socorrista, v.identificacao as viatura, t.aberto_em
          from public.turnos t
          join public.motoristas m on m.id = t.motorista_id
          join public.veiculos v on v.id = t.veiculo_id
         where t.situacao = 'ABERTO' and t.aberto_em < now() - make_interval(hours => p_horas_turno)
    ),
    turnos_a_aprovar as (
        select t.id, m.nome as socorrista, v.identificacao as viatura, t.data_turno
          from public.turnos t
          join public.motoristas m on m.id = t.motorista_id
          join public.veiculos v on v.id = t.veiculo_id
         where t.situacao = 'AGUARDANDO_APROVACAO'
    ),
    todos as (
        select 'CONTA_A_RECEBER_ATRASADA'::text as tipo, 'URGENTE'::text as gravidade, count(*)::int as quantidade,
               sum(valor) as valor_total,
               count(*) || case when count(*) = 1 then ' conta a receber vencida' else ' contas a receber vencidas' end as resumo,
               (select coalesce(jsonb_agg(jsonb_build_object('descricao', descricao, 'contratante', contratante,
                       'vencimento', vencimento, 'diasAtraso', v_hoje - vencimento, 'valor', valor)
                       order by vencimento, id), '[]'::jsonb)
                  from (select * from contas order by vencimento, id limit 10) l) as itens
          from contas having count(*) > 0
        union all
        select 'DESPESA_VENCIDA', 'URGENTE', count(*)::int, sum(valor),
               count(*) || case when count(*) = 1 then ' despesa vencida sem pagar' else ' despesas vencidas sem pagar' end,
               (select coalesce(jsonb_agg(jsonb_build_object('descricao', descricao, 'vencimento', vencimento,
                       'diasAtraso', v_hoje - vencimento, 'valor', valor) order by vencimento, id), '[]'::jsonb)
                  from (select * from despesas_vencidas order by vencimento, id limit 10) l)
          from despesas_vencidas having count(*) > 0
        union all
        select 'OP_ATRASADA', 'URGENTE', count(*)::int, sum(valor),
               count(*) || case when count(*) = 1 then ' OP com pagamento atrasado' else ' OPs com pagamento atrasado' end,
               (select coalesce(jsonb_agg(jsonb_build_object('numero', numero, 'programado', programado,
                       'diasAtraso', v_hoje - programado, 'valor', valor) order by programado, id), '[]'::jsonb)
                  from (select * from ops order by programado, id limit 10) l)
          from ops having count(*) > 0
        union all
        select 'DOCUMENTO_VENCIDO', 'URGENTE', count(*)::int, null::numeric,
               count(*) || case when count(*) = 1 then ' documento vencido' else ' documentos vencidos' end,
               (select coalesce(jsonb_agg(jsonb_build_object('documento', tipo, 'dono', dono, 'venceEm', vence_em,
                       'diasVencido', v_hoje - vence_em) order by vence_em, id), '[]'::jsonb)
                  from (select * from docs where vence_em < v_hoje order by vence_em, id limit 10) l)
          from docs where vence_em < v_hoje having count(*) > 0
        union all
        select 'DOCUMENTO_A_VENCER', 'ATENCAO', count(*)::int, null::numeric,
               count(*) || case when count(*) = 1 then ' documento vence' else ' documentos vencem' end
                 || ' em ate ' || p_dias_documento || ' dias',
               (select coalesce(jsonb_agg(jsonb_build_object('documento', tipo, 'dono', dono, 'venceEm', vence_em,
                       'diasParaVencer', vence_em - v_hoje) order by vence_em, id), '[]'::jsonb)
                  from (select * from docs where vence_em >= v_hoje order by vence_em, id limit 10) l)
          from docs where vence_em >= v_hoje having count(*) > 0
        union all
        select 'TURNO_ABERTO_HA_MUITO_TEMPO', 'ATENCAO', count(*)::int, null::numeric,
               count(*) || case when count(*) = 1 then ' turno aberto' else ' turnos abertos' end
                 || ' ha mais de ' || p_horas_turno || ' horas',
               (select coalesce(jsonb_agg(jsonb_build_object('socorrista', socorrista, 'viatura', viatura,
                       'abertoEm', aberto_em) order by aberto_em, id), '[]'::jsonb)
                  from (select * from turnos_longos order by aberto_em, id limit 10) l)
          from turnos_longos having count(*) > 0
        union all
        select 'TURNO_PARA_APROVAR', 'ATENCAO', count(*)::int, null::numeric,
               count(*) || case when count(*) = 1 then ' turno esperando aprovacao' else ' turnos esperando aprovacao' end,
               (select coalesce(jsonb_agg(jsonb_build_object('socorrista', socorrista, 'viatura', viatura,
                       'data', data_turno) order by data_turno, id), '[]'::jsonb)
                  from (select * from turnos_a_aprovar order by data_turno, id limit 10) l)
          from turnos_a_aprovar having count(*) > 0
        union all
        select 'DESPESA_PARA_APROVAR', 'ATENCAO', count(*)::int, sum(valor),
               count(*) || case when count(*) = 1 then ' despesa esperando aprovacao' else ' despesas esperando aprovacao' end,
               (select coalesce(jsonb_agg(jsonb_build_object('descricao', descricao, 'lancadaEm', data_lancamento,
                       'valor', valor) order by data_lancamento, id), '[]'::jsonb)
                  from (select * from despesas_a_aprovar order by data_lancamento, id limit 10) l)
          from despesas_a_aprovar having count(*) > 0
    )
    select t.tipo, t.gravidade, t.quantidade, t.valor_total, t.resumo, t.itens
      from todos t
     order by case t.gravidade when 'URGENTE' then 0 else 1 end, t.tipo;
end;
$$;

comment on function public.alertas_do_dono(integer, integer) is
    'O que precisa de atencao hoje (atrasos, documentos, turnos, aprovacoes), uma linha por tipo com ocorrencia. So o administrador chama. So le.';

revoke execute on function public.alertas_do_dono(integer, integer) from public;
revoke execute on function public.alertas_do_dono(integer, integer) from anon;
grant execute on function public.alertas_do_dono(integer, integer) to authenticated;
