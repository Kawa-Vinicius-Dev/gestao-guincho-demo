-- Pendencias do periodo passa a enxergar as situacoes da conciliacao.
--
-- A tela nasceu com tres faltas — sem valor, sem socorrista, sem viatura — e
-- ficou parada ali enquanto o resto do modulo aprendeu duas situacoes novas:
-- "aguardando proxima OP" (a OS do diario que nao veio na OP do periodo) e
-- "valor divergente" (a OP pagou diferente do que foi informado a mao). As duas
-- impedem o fechamento tanto quanto uma OS sem socorrista, e nao apareciam na
-- unica tela que existe para fechar o periodo: quem conferia ali via a lista
-- vazia e concluia, errado, que estava tudo certo.
--
-- Duas mudancas, entao:
--
-- 1. Cada linha passa a dizer em que situacao esta, com os mesmos nomes da tela
--    de ordens de servico e do painel Porto. Situacao e `porto_os_situacao`, a
--    mesma fonte das outras telas — nao uma regra repetida aqui, que amanha
--    discordaria das outras.
--
-- 2. A lista passa a incluir as OS DIVERGENTE e AGUARDANDO_PROXIMA_OP, mesmo
--    quando nao falta nenhum campo nelas. Elas nao tem o que preencher: o que a
--    tela oferece e ver e abrir a OS. Por isso vem com `apenasConferir`, e a
--    tela nao desenha campo de acerto nessas linhas.
--
-- O recorte do periodo passa a ser a competencia, e nao mais a data do
-- atendimento ou o fim da OP. E a regra de ouro do modulo: a competencia de uma
-- OS e a OP em que ela entrou. Para a OS que ficou para a proxima OP, a
-- competencia ja vem projetada para a seguinte, que e onde ela precisa ser
-- cobrada — e era justamente a linha que sumia da tela.

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
        'valorTotal', coalesce(nullif(t.valor_total, 0), t.valor_manual, 0),
        'numeroOp', t.numero_op,
        'semValor', t.valor_manual is null and t.valor_total = 0,
        'semSocorrista', t.motorista_id is null,
        'semViatura', coalesce(btrim(t.sigla_viatura), '') = '',
        'situacao', t.situacao,
        'competenciaInicio', t.competencia_inicio,
        'competenciaFim', t.competencia_fim,
        'valorManual', t.valor_manual,
        'divergencia', t.divergencia,
        -- Linha sem campo a preencher: so existe para ser vista e aberta.
        'apenasConferir', not (
            (t.valor_manual is null and t.valor_total = 0)
            or t.motorista_id is null
            or coalesce(btrim(t.sigla_viatura), '') = ''
        )
    ) order by t.data_atendimento, t.numero), '[]'::jsonb) into v
    from (
        select os.id, os.numero, os.data_atendimento, os.seguradora, os.especialidade,
               os.sigla_viatura, os.socorrista, os.motorista_id, os.valor_total, os.valor_manual,
               op.numero as numero_op,
               s.situacao, s.competencia_inicio, s.competencia_fim, s.divergencia
        from public.ordens_servico_porto os
        join public.porto_os_situacao() s on s.os_id = os.id
        left join public.ordens_pagamento_porto op on op.id = os.ordem_pagamento_id
        where coalesce(s.competencia_fim, os.data_atendimento) between p_inicio and p_fim
          -- Servico cancelado nao tem o que resolver: nao houve atendimento.
          and os.status_operacional <> 'CANCELADO'
          and ((os.valor_manual is null and os.valor_total = 0)
               or os.motorista_id is null
               or coalesce(btrim(os.sigla_viatura), '') = ''
               or s.situacao in ('DIVERGENTE', 'AGUARDANDO_PROXIMA_OP'))
    ) t;

    return v;
end;
$$;
