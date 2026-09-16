-- O painel do dia traz servico cancelado no meio dos outros.
--
-- Ele precisa ficar registrado — o acionamento existiu e alguem vai perguntar
-- por ele —, mas nao pode entrar como servico a receber nem aparecer na lista
-- de pendencias de valor: nao ha valor a informar para o que nao aconteceu. A
-- leitura do painel marca a linha com `cancelado` e aqui a OS nasce CANCELADO.
--
-- Uma OS cancelada que depois apareca numa OP volta a NORMAL: se a Porto pagou,
-- o servico aconteceu, e o relatorio da OP e a fonte mais confiavel.
do $$
declare v_def text; v_antigo text; v_novo text;
begin
    select pg_get_functiondef(p.oid) into v_def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'porto_confirmar_importacao';

    v_antigo := 'else ''NORMAL'' end::public.status_operacional_porto';
    v_novo := 'when coalesce(v_linha ->> ''cancelado'', ''false'') = ''true'' then ''CANCELADO'''
              || ' else ''NORMAL'' end::public.status_operacional_porto';

    if position(v_antigo in v_def) = 0 then
        raise exception 'expressao de status operacional nao encontrada';
    end if;

    execute replace(v_def, v_antigo, v_novo);
end $$;
