-- Ficha do socorrista mostra so os servicos do periodo escolhido.
--
-- Kawa abriu a ficha do Anderson na OP de setembro e apareceram servicos de
-- abril: a lista "Servicos prestados", o total e as viaturas contavam todas as OS
-- da pessoa, de qualquer periodo (85 de abril na ficha de setembro). A comissao
-- em si ja estava certa. Esta e a versao de uma OP, usada pela tela que esta no
-- ar; a versao por periodo (detalhe_socorrista_ops) ja nasceu com o filtro.
do $$
declare v_def text; v_antes text; v_filtro text;
begin
    select pg_get_functiondef('public.detalhe_socorrista_op'::regproc) into v_def;
    v_filtro := ' and (os.ordem_pagamento_id = p_op_id or (os.ordem_pagamento_id is null and os.data_atendimento between v_ini and v_fim))';

    v_antes := 'where os.motorista_id = m.id and os.sigla_viatura is not null)';
    if position(v_antes in v_def) = 0 then raise exception 'viaturas nao encontradas'; end if;
    v_def := replace(v_def, v_antes, 'where os.motorista_id = m.id and os.sigla_viatura is not null' || v_filtro || ')');

    v_antes := 'select count(*) from public.ordens_servico_porto os where os.motorista_id = m.id)';
    if position(v_antes in v_def) = 0 then raise exception 'total nao encontrado'; end if;
    v_def := replace(v_def, v_antes, 'select count(*) from public.ordens_servico_porto os where os.motorista_id = m.id and os.status_operacional <> ''CANCELADO''' || v_filtro || ')');

    v_antes := '            where os.motorista_id = m.id), ''[]''::jsonb)';
    if position(v_antes in v_def) = 0 then raise exception 'servicos nao encontrados'; end if;
    execute replace(v_def, v_antes, '            where os.motorista_id = m.id' || v_filtro || '), ''[]''::jsonb)');
end $$;
