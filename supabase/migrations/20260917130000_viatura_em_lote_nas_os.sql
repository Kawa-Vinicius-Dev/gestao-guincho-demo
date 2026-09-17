-- Viatura em lote na tela de ordens de servico.
--
-- A OP da Porto nunca traz a sigla, entao as OS importadas por OP ficam sem
-- viatura (pendentes). Enquanto o painel diario nao cobre o passado, quem conhece
-- a operacao filtra (periodo, socorrista, "sem viatura") e aplica a viatura as OS
-- filtradas de uma vez, com confirmacao na tela.
--
-- O filtro vira uma funcao so, usada pela lista e pelo lote: o que a pessoa ve
-- na tela e exatamente o que o lote altera.

create or replace function public.porto_os_filtradas(
    p_inicio date, p_fim date,
    p_numero_os text default null, p_numero_op text default null,
    p_motorista_id bigint default null, p_sigla text default null,
    p_especialidade text default null, p_situacao text default null,
    p_sem_viatura boolean default false
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
       and (not coalesce(p_sem_viatura, false) or coalesce(btrim(os.sigla_viatura), '') = '')
$$;
revoke execute on function public.porto_os_filtradas(date, date, text, text, bigint, text, text, text, boolean) from public, anon, authenticated;

drop function if exists public.porto_listar_os(date, date, text, text, bigint, text, text, text, integer, integer);

create or replace function public.porto_listar_os(
    p_inicio date, p_fim date,
    p_numero_os text default null, p_numero_op text default null,
    p_motorista_id bigint default null, p_sigla text default null,
    p_especialidade text default null, p_situacao text default null,
    p_limite integer default 100, p_deslocamento integer default 0,
    p_sem_viatura boolean default false
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
         where os.id in (select public.porto_os_filtradas(p_inicio, p_fim, p_numero_os, p_numero_op,
                            p_motorista_id, p_sigla, p_especialidade, p_situacao, p_sem_viatura))
    )
    select jsonb_build_object(
        'total', (select count(*) from filtradas),
        'semViatura', (select count(*) from filtradas where coalesce(btrim(sigla_viatura), '') = ''),
        'valorTotal', (select coalesce(sum(valor_total), 0) from filtradas),
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
revoke execute on function public.porto_listar_os(date, date, text, text, bigint, text, text, text, integer, integer, boolean) from public, anon;
grant execute on function public.porto_listar_os(date, date, text, text, bigint, text, text, text, integer, integer, boolean) to authenticated;

-- Aplica a viatura as OS do filtro. Por padrao so as que estao sem viatura:
-- sigla que veio do painel diario nao e sobrescrita sem a pessoa pedir.
create or replace function public.porto_definir_viatura_em_lote(
    p_nova_sigla text,
    p_inicio date, p_fim date,
    p_numero_os text default null, p_numero_op text default null,
    p_motorista_id bigint default null, p_sigla text default null,
    p_especialidade text default null, p_situacao text default null,
    p_sem_viatura boolean default false,
    p_so_sem_viatura boolean default true
)
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare v_sigla text := upper(btrim(p_nova_sigla)); v_total integer;
begin
    perform public.exigir_administrador();
    if coalesce(v_sigla, '') = '' then
        raise exception 'Escolha a viatura.' using errcode = 'invalid_parameter_value';
    end if;
    if not exists (select 1 from public.veiculos v
                    where upper(btrim(coalesce(v.sigla_porto, v.identificacao))) = v_sigla
                       or upper(btrim(v.identificacao)) = v_sigla) then
        raise exception 'Viatura % não está cadastrada.', v_sigla using errcode = 'invalid_parameter_value';
    end if;

    update public.ordens_servico_porto os
       set sigla_viatura = v_sigla
     where os.id in (select public.porto_os_filtradas(p_inicio, p_fim, p_numero_os, p_numero_op,
                        p_motorista_id, p_sigla, p_especialidade, p_situacao, p_sem_viatura))
       and (not coalesce(p_so_sem_viatura, true) or coalesce(btrim(os.sigla_viatura), '') = '');
    get diagnostics v_total = row_count;
    return v_total;
end;
$$;
revoke execute on function public.porto_definir_viatura_em_lote(text, date, date, text, text, bigint, text, text, text, boolean, boolean) from public, anon;
grant execute on function public.porto_definir_viatura_em_lote(text, date, date, text, text, bigint, text, text, text, boolean, boolean) to authenticated;
