-- Diario Operacional x OP — etapa 4: a tela de OS enxerga situacao e competencia.
--
-- A lista filtrava por data do servico e por "paga / aguardando", que era tudo
-- que existia antes do valor manual. Agora cada OS tem situacao (etapa 1) e uma
-- competencia financeira que pode ser diferente do mes do servico — e a tela
-- precisa poder olhar pelos dois lados: "o que eu fiz nesta quinzena" e "o que
-- vai ser pago nesta competencia".

drop function if exists public.porto_os_filtradas(date, date, text, text, bigint, text, text, text, boolean);
drop function if exists public.porto_listar_os(date, date, text, text, bigint, text, text, text, integer, integer, boolean);

create or replace function public.porto_os_filtradas(
    p_inicio date, p_fim date,
    p_numero_os text default null, p_numero_op text default null,
    p_motorista_id bigint default null, p_sigla text default null,
    p_especialidade text default null, p_situacao text default null,
    p_sem_viatura boolean default false,
    -- Falso: o periodo recorta pela data do servico. Verdadeiro: pela competencia
    -- financeira, que e a da OP em que a OS entrou (ou a projetada, sem OP).
    p_por_competencia boolean default false
)
returns setof bigint
language sql
stable
security definer
set search_path to ''
as $$
    select os.id
      from public.ordens_servico_porto os
      left join public.ordens_pagamento_porto op on op.id = os.ordem_pagamento_id
      join public.porto_os_situacao() s on s.os_id = os.id
     where (case when coalesce(p_por_competencia, false)
                 then s.competencia_fim between p_inicio and p_fim
                 else os.data_atendimento between p_inicio and p_fim end)
       and os.status_operacional::text <> 'CANCELADO'
       and (nullif(btrim(p_numero_os), '') is null or os.numero ilike '%' || btrim(p_numero_os) || '%')
       and (nullif(btrim(p_numero_op), '') is null or op.numero ilike '%' || btrim(p_numero_op) || '%')
       and (p_motorista_id is null or os.motorista_id = p_motorista_id)
       and (nullif(btrim(p_sigla), '') is null or upper(btrim(os.sigla_viatura)) = upper(btrim(p_sigla)))
       and (nullif(btrim(p_especialidade), '') is null or os.especialidade ilike '%' || btrim(p_especialidade) || '%')
       and (nullif(btrim(p_situacao), '') is null
            -- Os dois antigos continuam valendo: filtro salvo na tela nao quebra.
            or (p_situacao = 'PAGA' and os.ordem_pagamento_id is not null)
            or (p_situacao = 'AGUARDANDO' and os.ordem_pagamento_id is null)
            or p_situacao = s.situacao)
       and (not coalesce(p_sem_viatura, false) or coalesce(btrim(os.sigla_viatura), '') = '')
$$;

create or replace function public.porto_listar_os(
    p_inicio date, p_fim date,
    p_numero_os text default null, p_numero_op text default null,
    p_motorista_id bigint default null, p_sigla text default null,
    p_especialidade text default null, p_situacao text default null,
    p_limite integer default 100, p_deslocamento integer default 0,
    p_sem_viatura boolean default false, p_por_competencia boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
    v_pct numeric := public.percentual_comissao();
    v_resultado jsonb;
begin
    perform public.exigir_administrador();

    with filtradas as (
        select os.id, os.numero, os.data_atendimento, os.especialidade, os.sigla_viatura,
               os.valor_total, os.valor_manual, os.motorista_id, os.ordem_pagamento_id, os.socorrista,
               m.nome as motorista, op.numero as numero_op,
               s.situacao, s.competencia_inicio, s.competencia_fim,
               s.valor_previsto, s.divergencia, s.sem_valor
          from public.ordens_servico_porto os
          left join public.motoristas m on m.id = os.motorista_id
          left join public.ordens_pagamento_porto op on op.id = os.ordem_pagamento_id
          join public.porto_os_situacao() s on s.os_id = os.id
         where os.id in (select public.porto_os_filtradas(p_inicio, p_fim, p_numero_os, p_numero_op,
                            p_motorista_id, p_sigla, p_especialidade, p_situacao, p_sem_viatura,
                            p_por_competencia))
    )
    select jsonb_build_object(
        'total', (select count(*) from filtradas),
        'semViatura', (select count(*) from filtradas where coalesce(btrim(sigla_viatura), '') = ''),
        -- O oficial continua sendo a soma do que a OP pagou; o previsto soma
        -- tambem o que foi informado a mao e ainda nao foi pago.
        'valorTotal', (select coalesce(sum(valor_total), 0) from filtradas),
        'valorPrevisto', (select coalesce(sum(coalesce(valor_previsto, 0)), 0) from filtradas),
        'semValor', (select count(*) from filtradas where sem_valor),
        'divergentes', (select count(*) from filtradas where situacao = 'DIVERGENTE'),
        'comissaoTotal', (select coalesce(round(sum(valor_total) * v_pct, 2), 0)
                            from filtradas where ordem_pagamento_id is not null),
        'itens', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', f.id, 'numero', f.numero, 'dataAtendimento', f.data_atendimento,
                'especialidade', f.especialidade, 'viatura', f.sigla_viatura,
                'valorTotal', f.valor_total, 'motoristaId', f.motorista_id,
                'motorista', f.motorista, 'socorristaNoArquivo', f.socorrista,
                'ordemPagamentoId', f.ordem_pagamento_id, 'numeroOp', f.numero_op,
                'situacao', f.situacao,
                'competenciaInicio', f.competencia_inicio, 'competenciaFim', f.competencia_fim,
                'valorManual', f.valor_manual, 'valorPrevisto', f.valor_previsto,
                'divergencia', f.divergencia,
                'comissao', case when f.ordem_pagamento_id is not null
                                 then round(f.valor_total * v_pct, 2) end
            ) order by f.data_atendimento desc nulls last, f.numero)
              from (select * from filtradas
                     order by data_atendimento desc nulls last, numero
                     limit greatest(p_limite, 1) offset greatest(p_deslocamento, 0)) f
        ), '[]'::jsonb)
    ) into v_resultado;

    return v_resultado;
end;
$$;

revoke execute on function public.porto_os_filtradas(date, date, text, text, bigint, text, text, text, boolean, boolean) from public, anon;
grant execute on function public.porto_os_filtradas(date, date, text, text, bigint, text, text, text, boolean, boolean) to authenticated;
revoke execute on function public.porto_listar_os(date, date, text, text, bigint, text, text, text, integer, integer, boolean, boolean) from public, anon;
grant execute on function public.porto_listar_os(date, date, text, text, bigint, text, text, text, integer, integer, boolean, boolean) to authenticated;
