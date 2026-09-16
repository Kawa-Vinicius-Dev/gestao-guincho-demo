-- A serie do painel passa a respeitar a regra da OP.
--
-- Kawa definiu que a OP entra no dashboard no periodo dela e que a data de
-- recebimento e irrelevante. A primeira versao da serie contrariava isso: punha
-- o recebido na data em que o dinheiro caiu. Uma OP de abril paga em 07/06
-- deixava a linha de recebido zerada em abril e a tela parecia quebrada, com os
-- numeros certos. Recebido e programado agora caem no fim do periodo da OP; sem
-- periodo definido (OP cadastrada a mao), cai-se para a data que existir.
do $$
declare v_def text; v_antes text; v_depois text;
begin
    select pg_get_functiondef(p.oid) into v_def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'porto_dashboard_alto_nivel';

    v_antes := 'select date_trunc(v_unidade, op.data_recebimento::timestamp)::date as balde,
               sum(op.valor_recebido) as valor
        from public.ordens_pagamento_porto op
        where op.data_recebimento between p_inicio and p_fim
        group by 1';
    v_depois := 'select date_trunc(v_unidade, coalesce(op.periodo_fim, op.data_recebimento)::timestamp)::date as balde,
               sum(op.valor_recebido) as valor
        from public.ordens_pagamento_porto op
        where op.valor_recebido is not null
          and coalesce(op.periodo_fim, op.data_recebimento) between p_inicio and p_fim
        group by 1';
    if position(v_antes in v_def) = 0 then
        raise exception 'serie de recebido nao encontrada';
    end if;
    v_def := replace(v_def, v_antes, v_depois);

    v_antes := 'select date_trunc(v_unidade, op.data_pagamento_programada::timestamp)::date as balde,
               sum(op.valor_total) as valor
        from public.ordens_pagamento_porto op
        where op.data_pagamento_programada between p_inicio and p_fim
        group by 1';
    v_depois := 'select date_trunc(v_unidade, coalesce(op.periodo_fim, op.data_pagamento_programada)::timestamp)::date as balde,
               sum(op.valor_total) as valor
        from public.ordens_pagamento_porto op
        where coalesce(op.periodo_fim, op.data_pagamento_programada) between p_inicio and p_fim
        group by 1';
    if position(v_antes in v_def) = 0 then
        raise exception 'serie de programado nao encontrada';
    end if;

    execute replace(v_def, v_antes, v_depois);
end $$;
