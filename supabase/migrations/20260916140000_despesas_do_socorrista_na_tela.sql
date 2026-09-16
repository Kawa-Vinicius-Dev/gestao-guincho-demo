-- Toda despesa ligada a um socorrista aparece na tela dele.
--
-- Ate aqui a tela do socorrista so mostrava a alimentacao: e ela que desconta da
-- comissao, e o detalhe nasceu para explicar o fechamento. Mas o formulario de
-- despesa pede o socorrista em qualquer categoria, e quem preenchia esse campo
-- numa despesa de outra natureza — um pedagio, uma multa, uma peca — nao
-- reencontrava o lancamento em lugar nenhum ligado a pessoa. O campo prometia um
-- vinculo que nenhuma tela mostrava.
--
-- O que muda e so o que a funcao DEVOLVE. Nada aqui altera o que desconta da
-- comissao: `comissao_da_op` continua intacta e segue contando apenas
-- ALIMENTACAO_FUNCIONARIO. Por isso cada linha vem com `descontaDaComissao`, e a
-- tela separa as duas: mostrar nao e cobrar.
--
-- A janela e a mesma da OP — o resto da funcao ja fala do periodo dela —, e sem
-- periodo definido nao ha janela: listar "tudo" ao lado de um fechamento de
-- quinze dias confundiria mais do que ajuda.
--
-- Fora da lista, de proposito:
--   protocolo COMISSAO-%  -> e o pagamento da comissao virando despesa da
--                            empresa. Aparecer como "custo do socorrista" diria
--                            o contrario do que o lancamento e.
--   status REJEITADO      -> o mesmo criterio que a alimentacao ja usa.

create or replace function public.detalhe_socorrista_op(
    p_motorista_id bigint, p_op_id bigint
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v jsonb;
    v_pct numeric := public.percentual_comissao();
    v_ini date;
    v_fim date;
begin
    perform public.exigir_administrador();

    select coalesce(periodo_inicio, data_pagamento_programada),
           coalesce(periodo_fim, data_pagamento_programada)
      into v_ini, v_fim
      from public.ordens_pagamento_porto where id = p_op_id;

    select jsonb_build_object(
        'id', m.id, 'nome', m.nome, 'ativo', m.ativo,
        'telefone', m.telefone, 'qra', m.qra,
        'email', (select p.email from public.perfis p where p.id = m.perfil_id),
        'veiculosUtilizados', coalesce((
            select jsonb_agg(distinct os.sigla_viatura)
            from public.ordens_servico_porto os
            where os.motorista_id = m.id and os.sigla_viatura is not null), '[]'::jsonb),
        'totalServicosPrestados', (
            select count(*) from public.ordens_servico_porto os where os.motorista_id = m.id),
        'comissao', public.comissao_da_op(p_op_id, m.id),
        'despesas', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', d.id, 'descricao', d.descricao, 'data', d.data_lancamento,
                'valor', d.valor, 'categoria', c.nome, 'veiculo', v2.identificacao,
                'situacao', d.status, 'aprovada', d.aprovada,
                'descontaDaComissao', d.natureza = 'ALIMENTACAO_FUNCIONARIO',
                'observacoes', d.observacoes)
                order by d.data_lancamento desc, d.id desc)
            from public.despesas d
            join public.categorias c on c.id = d.categoria_id
            left join public.veiculos v2 on v2.id = d.veiculo_id
            where d.motorista_id = m.id
              and d.status <> 'REJEITADO'
              and (d.protocolo is null or d.protocolo not like 'COMISSAO-%')
              and v_ini is not null and v_fim is not null
              and d.data_lancamento between v_ini and v_fim), '[]'::jsonb),
        'servicos', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', os.id, 'numeroOs', os.numero, 'dataAtendimento', os.data_atendimento,
                'especialidade', os.especialidade, 'viatura', os.sigla_viatura,
                'numeroOp', op.numero, 'valorServico', os.valor_total,
                'statusPagamento', case
                    when os.ordem_pagamento_id is null then 'AGUARDANDO_PAGAMENTO'
                    when os.ordem_pagamento_id = p_op_id then 'PAGO'
                    else 'PAGO_EM_OUTRO_PERIODO' end,
                'pagoNoPeriodo', os.ordem_pagamento_id = p_op_id,
                'comissaoGerada', case when os.status_financeiro = 'RECEBIDO'
                    then round(os.valor_total * v_pct, 2) end)
                order by os.data_atendimento desc nulls last, os.numero)
            from public.ordens_servico_porto os
            left join public.ordens_pagamento_porto op on op.id = os.ordem_pagamento_id
            where os.motorista_id = m.id), '[]'::jsonb)
    ) into v
    from public.motoristas m where m.id = p_motorista_id;

    if v is null then
        raise exception 'Socorrista nao encontrado.' using errcode = 'no_data_found';
    end if;
    return v;
end;
$$;

revoke execute on function public.detalhe_socorrista_op(bigint, bigint) from public, anon;
grant execute on function public.detalhe_socorrista_op(bigint, bigint) to authenticated;
