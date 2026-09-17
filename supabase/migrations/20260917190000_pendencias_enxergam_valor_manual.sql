-- Conserto: Pendências do período parou de enxergar o valor informado.
--
-- Desde a etapa 1, o valor digitado para uma OS sem OP vai para `valor_manual` —
-- `valor_total` passou a ser so o oficial da OP. Mas `porto_pendencias_os`
-- continuava lendo "sem valor" como `valor_total = 0`: quem resolvia a pendencia
-- na tela via a OS voltar para a lista como se nada tivesse sido salvo.

create or replace function public.porto_pendencias_os(p_inicio date, p_fim date)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
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
        -- O que a tela mostra e o valor que vale hoje: o da OP, se ja veio, ou o
        -- informado a mao enquanto ela nao vem.
        'valorTotal', coalesce(nullif(t.valor_total, 0), t.valor_manual, 0),
        'numeroOp', t.numero_op,
        'semValor', t.valor_manual is null and t.valor_total = 0,
        'semSocorrista', t.motorista_id is null,
        'semViatura', coalesce(btrim(t.sigla_viatura), '') = ''
    ) order by t.data_atendimento, t.numero), '[]'::jsonb) into v
    from (
        select os.id, os.numero, os.data_atendimento, os.seguradora, os.especialidade,
               os.sigla_viatura, os.socorrista, os.motorista_id, os.valor_total, os.valor_manual,
               op.numero as numero_op
        from public.ordens_servico_porto os
        left join public.ordens_pagamento_porto op on op.id = os.ordem_pagamento_id
        where coalesce(op.periodo_fim, os.data_atendimento) between p_inicio and p_fim
          -- Servico cancelado nao tem o que resolver: nao houve atendimento.
          and os.status_operacional <> 'CANCELADO'
          and ((os.valor_manual is null and os.valor_total = 0)
               or os.motorista_id is null
               or coalesce(btrim(os.sigla_viatura), '') = '')
    ) t;

    return v;
end;
$$;
