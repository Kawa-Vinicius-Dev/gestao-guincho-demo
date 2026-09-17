-- Tela de ordens de servico.
--
-- A tela antiga mostrava filtros (OP, especialidade, socorrista, seguradora,
-- status) que a consulta nunca aplicava, e cortava em 1000 linhas sem avisar.
-- Aqui o filtro, a contagem e as somas acontecem no banco; a tela pagina.

create or replace function public.porto_listar_os(
    p_inicio date,
    p_fim date,
    p_numero_os text default null,
    p_numero_op text default null,
    p_motorista_id bigint default null,
    p_sigla text default null,
    p_especialidade text default null,
    -- 'PAGA' (ja veio numa OP) ou 'AGUARDANDO' (so no painel diario)
    p_situacao text default null,
    p_limite integer default 100,
    p_deslocamento integer default 0
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
               os.valor_total, os.motorista_id, os.ordem_pagamento_id, os.socorrista,
               m.nome as motorista, op.numero as numero_op
          from public.ordens_servico_porto os
          left join public.motoristas m on m.id = os.motorista_id
          left join public.ordens_pagamento_porto op on op.id = os.ordem_pagamento_id
         where os.data_atendimento between p_inicio and p_fim
           and os.status_operacional <> 'CANCELADO'
           and (nullif(btrim(p_numero_os), '') is null or os.numero ilike '%' || btrim(p_numero_os) || '%')
           and (nullif(btrim(p_numero_op), '') is null or op.numero ilike '%' || btrim(p_numero_op) || '%')
           and (p_motorista_id is null or os.motorista_id = p_motorista_id)
           and (nullif(btrim(p_sigla), '') is null or upper(btrim(os.sigla_viatura)) = upper(btrim(p_sigla)))
           and (nullif(btrim(p_especialidade), '') is null or os.especialidade ilike '%' || btrim(p_especialidade) || '%')
           and (p_situacao is null
                or (p_situacao = 'PAGA' and os.ordem_pagamento_id is not null)
                or (p_situacao = 'AGUARDANDO' and os.ordem_pagamento_id is null))
    )
    select jsonb_build_object(
        'total', (select count(*) from filtradas),
        'valorTotal', (select coalesce(sum(valor_total), 0) from filtradas),
        -- Comissao so existe quando a OS foi paga numa OP.
        'comissaoTotal', (select coalesce(round(sum(valor_total) * v_pct, 2), 0)
                            from filtradas where ordem_pagamento_id is not null),
        'itens', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', f.id, 'numero', f.numero, 'dataAtendimento', f.data_atendimento,
                'especialidade', f.especialidade, 'viatura', f.sigla_viatura,
                'valorTotal', f.valor_total, 'motoristaId', f.motorista_id,
                'motorista', f.motorista, 'socorristaNoArquivo', f.socorrista,
                'ordemPagamentoId', f.ordem_pagamento_id, 'numeroOp', f.numero_op,
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

revoke execute on function public.porto_listar_os(date, date, text, text, bigint, text, text, text, integer, integer) from public, anon;
grant execute on function public.porto_listar_os(date, date, text, text, bigint, text, text, text, integer, integer) to authenticated;

-- Troca socorrista e/ou viatura de uma OS. Valor e OP nao: vem da Porto.
-- Escolha feita a mao nao e desfeita pela proxima importacao, a receita passa a
-- apontar para o socorrista novo, e a comissao e recalculada.
create or replace function public.porto_corrigir_os(
    p_os_id bigint,
    p_motorista_id bigint default null,
    p_sigla text default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
    perform public.exigir_administrador();

    update public.ordens_servico_porto os
       set motorista_id = coalesce(p_motorista_id, os.motorista_id),
           motorista_vinculo_manual = os.motorista_vinculo_manual or p_motorista_id is not null,
           sigla_viatura = coalesce(nullif(upper(btrim(p_sigla)), ''), os.sigla_viatura)
     where os.id = p_os_id;
    if not found then
        raise exception 'Ordem de serviço não encontrada.' using errcode = 'no_data_found';
    end if;

    if p_motorista_id is not null then
        update public.receitas set motorista_id = p_motorista_id where ordem_servico_porto_id = p_os_id;
        update public.contas_receber set motorista_id = p_motorista_id where ordem_servico_porto_id = p_os_id;
    end if;

    perform public.porto_sincronizar_comissoes();
end;
$$;

revoke execute on function public.porto_corrigir_os(bigint, bigint, text) from public, anon;
grant execute on function public.porto_corrigir_os(bigint, bigint, text) to authenticated;
