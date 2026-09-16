-- Painel Porto: faturamento por socorrista e por viatura, e OS sem vinculo.
--
-- Kawa corrigiu o "A receber" do painel: no modelo em que a OP chega paga e o
-- painel diario nasce sem valor, nao ha dinheiro pendente para mostrar. O que
-- falta nas OS e vinculo — socorrista ou viatura. E a pergunta que ele quer ver
-- respondida e "quanto cada socorrista e cada viatura faturou no periodo".
--
-- O conjunto de OS e o mesmo do resto do painel: periodo da OP (ou data do
-- atendimento, enquanto nao ha OP) e sem cancelados. Os criterios de "sem
-- socorrista" e "sem viatura" sao os mesmos da tela de pendencias, para o numero
-- do painel bater com a lista que resolve.
--
-- Faturamento sem vinculo nao some: vira a linha "Sem socorrista" / "Sem viatura",
-- e a soma das barras fecha com o faturamento do periodo. Sigla que nao casa com
-- o cadastro aparece pela propria sigla, em vez de sumir.
do $$
declare v_def text; v_antes text; v_depois text;
begin
    select pg_get_functiondef('public.porto_dashboard_alto_nivel'::regproc) into v_def;

    v_antes := '''opsDestaque'', v_ops
    );';
    v_depois := '''opsDestaque'', v_ops,
        ''faturamentoPorSocorrista'', (
            select coalesce(jsonb_agg(jsonb_build_object(
                ''chave'', g.chave, ''rotulo'', g.rotulo, ''valor'', g.valor,
                ''quantidade'', g.quantidade, ''semVinculo'', g.sem_vinculo
            ) order by g.sem_vinculo, g.valor desc, g.rotulo), ''[]''::jsonb)
            from (
                select coalesce(os.motorista_id::text, ''sem'') as chave,
                       coalesce(min(m.nome), ''Sem socorrista'') as rotulo,
                       sum(os.valor_total) as valor, count(*) as quantidade,
                       os.motorista_id is null as sem_vinculo
                from public.ordens_servico_porto os
                left join public.ordens_pagamento_porto op on op.id = os.ordem_pagamento_id
                left join public.motoristas m on m.id = os.motorista_id
                where coalesce(op.periodo_fim, os.data_atendimento) between p_inicio and p_fim
                  and os.status_operacional <> ''CANCELADO''
                group by os.motorista_id
            ) g),
        ''faturamentoPorViatura'', (
            select coalesce(jsonb_agg(jsonb_build_object(
                ''chave'', g.chave, ''rotulo'', g.rotulo, ''valor'', g.valor,
                ''quantidade'', g.quantidade, ''semVinculo'', g.sem_vinculo
            ) order by g.sem_vinculo, g.valor desc, g.rotulo), ''[]''::jsonb)
            from (
                select coalesce(s.sigla, ''sem'') as chave,
                       coalesce(min(v.identificacao), s.sigla, ''Sem viatura'') as rotulo,
                       sum(s.valor_total) as valor, count(*) as quantidade,
                       s.sigla is null as sem_vinculo
                from (
                    select nullif(upper(btrim(os.sigla_viatura)), '''') as sigla, os.valor_total
                    from public.ordens_servico_porto os
                    left join public.ordens_pagamento_porto op on op.id = os.ordem_pagamento_id
                    where coalesce(op.periodo_fim, os.data_atendimento) between p_inicio and p_fim
                      and os.status_operacional <> ''CANCELADO''
                ) s
                left join public.veiculos v on upper(btrim(v.sigla_porto)) = s.sigla
                group by s.sigla
            ) g),
        ''pendenciasVinculo'', (
            select jsonb_build_object(
                ''quantidade'', count(*) filter (
                    where os.motorista_id is null or coalesce(btrim(os.sigla_viatura), '''') = ''''),
                ''semSocorrista'', count(*) filter (where os.motorista_id is null),
                ''semViatura'', count(*) filter (where coalesce(btrim(os.sigla_viatura), '''') = ''''))
            from public.ordens_servico_porto os
            left join public.ordens_pagamento_porto op on op.id = os.ordem_pagamento_id
            where coalesce(op.periodo_fim, os.data_atendimento) between p_inicio and p_fim
              and os.status_operacional <> ''CANCELADO'')
    );';
    if position(v_antes in v_def) = 0 then
        raise exception 'retorno de porto_dashboard_alto_nivel nao encontrado';
    end if;

    execute replace(v_def, v_antes, v_depois);
end $$;
