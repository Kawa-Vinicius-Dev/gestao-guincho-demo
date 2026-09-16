-- ===========================================================================
-- Aplicar agora: as migracoes pendentes, na ordem, numa colagem so.
--
-- Cole este arquivo inteiro no SQL Editor do Supabase e rode.
--
--   20260916140000  despesas do socorrista na tela dele
--   20260916150000  administrador lanca em um passo
--   20260916160000  (regra de alimentacao — derrubada logo abaixo)
--   20260916170000  gasto de viatura e da viatura, alimentacao incluida
--
-- A 160000 vai junto so para a ordem bater com o repositorio: a 170000 logo
-- em seguida derruba o trigger que ela cria. Rodar as duas em sequencia deixa
-- o banco no estado certo.
--
-- Rodar duas vezes nao faz mal: sao create or replace / drop if exists.
-- Nenhuma apaga dado, altera coluna ou mexe em linha que ja existe.
-- ===========================================================================

-- ----- migrations/20260916140000_despesas_do_socorrista_na_tela.sql -----
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

-- ----- migrations/20260916150000_administrador_lanca_em_um_passo.sql -----
-- O administrador lanca a despesa num passo so.
--
-- Fluxo de hoje: o administrador preenche o formulario, escolhe "Paga", e a
-- despesa nasce PENDENTE e nao aprovada assim mesmo. Para ela chegar na Visao
-- geral ele ainda clica em "Aprovar" e depois em "Registrar pagamento" — tres
-- acoes para registrar um almoco de R$ 50 que ele mesmo ja pagou, e o campo
-- "Situacao" do formulario nao valia nada.
--
-- A segregacao de funcoes continua, e continua sendo levada a serio. O que muda
-- e ONDE ela se aplica:
--
--   despesa lancada por FUNCIONARIO -> nasce pendente, o administrador aprova.
--       E aqui que a regra existe: um segundo par de olhos sobre o gasto de
--       quem nao responde pelo caixa. Nada disto muda — nem o caminho, nem a
--       policy de insercao, nem `aprovar_despesa`, que segue recusando que
--       alguem aprove o proprio lancamento.
--
--   despesa lancada por ADMINISTRADOR -> nasce aprovada, por ele.
--       Aqui a regra nunca protegeu nada: `aprovar_despesa` ja recusa a
--       autoaprovacao, entao o administrador que lancava a propria despesa
--       ficava com ela travada em pendente para sempre, ou pedia a outro
--       administrador para aprovar um gasto que ele mesmo decidiu. O controle
--       nao acontecia; so o incomodo.
--
-- O registro fica honesto: `aprovado_por` guarda quem lancou, porque foi ele
-- quem aprovou, e a auditoria continua sabendo dizer de quem foi a decisao.
--
-- Por que RPC e nao insert direto: a policy `despesas_insercao` exige
-- `not aprovada and status = 'PENDENTE'`, e isso NAO muda — e o que impede
-- qualquer sessao de escrever uma despesa ja aprovada direto na tabela. Nascer
-- aprovada so acontece aqui dentro, onde `exigir_administrador()` confere quem
-- esta chamando.

create or replace function public.registrar_despesa_aprovada(
    p_descricao text,
    p_categoria_id bigint,
    p_valor numeric,
    p_data date,
    p_vencimento date default null,
    p_forma_pagamento text default null,
    p_veiculo_id bigint default null,
    p_motorista_id bigint default null,
    p_protocolo text default null,
    p_observacoes text default null,
    p_natureza public.natureza_despesa default 'GERAL',
    p_paga boolean default false,
    p_data_pagamento date default null
)
returns public.despesas
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_despesa public.despesas;
    v_quem uuid := (select auth.uid());
    -- Alimentacao e custo do socorrista, nao da viatura: a viatura sairia da
    -- conta no painel de qualquer forma, e gravar o vinculo so deixaria um
    -- rastro que nenhuma soma usa. Mesma regra que a tela aplica.
    v_alimentacao boolean := p_natureza = 'ALIMENTACAO_FUNCIONARIO' and p_motorista_id is not null;
begin
    perform public.exigir_administrador();

    if p_valor is null or p_valor <= 0 then
        raise exception 'Informe o valor da despesa.' using errcode = 'invalid_parameter_value';
    end if;
    if p_categoria_id is null then
        raise exception 'Informe a categoria da despesa.' using errcode = 'invalid_parameter_value';
    end if;

    insert into public.despesas (
        descricao, categoria_id, valor, data_lancamento, vencimento,
        forma_pagamento, veiculo_id, motorista_id, protocolo, observacoes,
        natureza, status, data_pagamento, aprovada, aprovado_por, aprovado_em, criado_por)
    values (
        p_descricao, p_categoria_id, p_valor, p_data, p_vencimento,
        p_forma_pagamento, case when v_alimentacao then null else p_veiculo_id end,
        p_motorista_id, p_protocolo, p_observacoes,
        case when v_alimentacao then 'ALIMENTACAO_FUNCIONARIO'::public.natureza_despesa
             else 'GERAL'::public.natureza_despesa end,
        (case when p_paga then 'PAGO' else 'PENDENTE' end)::public.status_despesa,
        -- A constraint `despesas_paga_tem_data` exige a data quando esta paga.
        -- Sem data informada, vale a do lancamento: e o dia em que o dinheiro
        -- saiu, que e o que o formulario acabou de dizer.
        case when p_paga then coalesce(p_data_pagamento, p_data) else null end,
        true, v_quem, now(), v_quem)
    returning * into v_despesa;

    return v_despesa;
end;
$$;

revoke execute on function public.registrar_despesa_aprovada(
    text, bigint, numeric, date, date, text, bigint, bigint, text, text,
    public.natureza_despesa, boolean, date) from public, anon;
grant execute on function public.registrar_despesa_aprovada(
    text, bigint, numeric, date, date, text, bigint, bigint, text, text,
    public.natureza_despesa, boolean, date) to authenticated;

-- ----- migrations/20260916160000_alimentacao_nunca_tem_viatura.sql -----
-- Alimentação nunca fica pendurada numa viatura — por qualquer porta.
--
-- A regra estava na tela: escolher a categoria Alimentação desativa o campo de
-- veículo. Isso resolve o formulário e só ele. Entram na tabela por outros
-- caminhos:
--
--   lancar_despesas_recorrentes  -> copia veiculo_id da despesa fixa e nunca
--                                   escreve natureza. Uma despesa fixa de
--                                   Alimentação com veículo escolhido no
--                                   cadastro reproduz o mesmo defeito todo mês.
--   registrar_alimentacao        -> o socorrista lançando a própria refeição.
--   insert direto pela policy    -> o funcionário lançando a dele.
--
-- Uma regra que vale em um caminho e não nos outros não é uma regra, é um
-- costume. Aqui ela passa a ser do banco: qualquer escrita em despesas, venha de
-- onde vier, sai obedecendo.
--
-- O critério é o nome da categoria, o mesmo que `registrar_alimentacao` já usa
-- para achá-la. Ter dois critérios para a mesma pergunta é como o lançamento do
-- administrador e o do socorrista acabariam em lados opostos do fechamento.
--
-- Sem socorrista a despesa NÃO vira ALIMENTACAO_FUNCIONARIO: não há de quem
-- descontar, e a marca viraria um estado que nenhuma tela consegue usar. Mas a
-- viatura sai do mesmo jeito — comida não é custo de veículo, com ou sem dono.

create or replace function public.despesa_alimentacao_nao_tem_viatura()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_e_alimentacao boolean;
begin
    select lower(btrim(c.nome)) = 'alimentação'
      into v_e_alimentacao
      from public.categorias c where c.id = new.categoria_id;

    if coalesce(v_e_alimentacao, false) or new.natureza = 'ALIMENTACAO_FUNCIONARIO' then
        new.veiculo_id := null;
        new.natureza := case when new.motorista_id is not null
            then 'ALIMENTACAO_FUNCIONARIO'::public.natureza_despesa
            else 'GERAL'::public.natureza_despesa end;
    end if;

    return new;
end;
$$;

drop trigger if exists despesas_alimentacao_sem_viatura on public.despesas;
create trigger despesas_alimentacao_sem_viatura
    before insert or update of categoria_id, veiculo_id, motorista_id, natureza
    on public.despesas
    for each row execute function public.despesa_alimentacao_nao_tem_viatura();

-- ----- migrations/20260916170000_gasto_de_viatura_e_da_viatura.sql -----
-- Todo gasto da viatura é da viatura, alimentação incluída.
--
-- Informação nova da operação, e ela derruba a premissa da migração
-- 20260916160000: o cartão que a equipe usa é vinculado à viatura. Então a
-- refeição comprada naquele cartão é custo daquela viatura, como o diesel e o
-- pedágio — não é adiantamento ao socorrista, e não tem por que sair do
-- líquido dele. A regra anterior tirava a viatura de toda despesa de
-- Alimentação; aqui ela cai.
--
-- O que volta ao que era:
--   - o trigger que apagava veiculo_id sai;
--   - registrar_despesa_aprovada grava a viatura que o formulário mandou e não
--     reescreve natureza.
--
-- O que NÃO volta, porque não dependia dessa premissa:
--   - registrar_alimentacao continua marcando ALIMENTACAO_FUNCIONARIO. É o
--     socorrista lançando a refeição que ele mesmo pagou, do bolso dele, e essa
--     é a que desconta da comissão. Nada aqui a toca.
--   - detalhe_socorrista_op continua listando as despesas no nome dele.
--   - o administrador continua lançando em um passo.

drop trigger if exists despesas_alimentacao_sem_viatura on public.despesas;
drop function if exists public.despesa_alimentacao_nao_tem_viatura();

-- Mesma assinatura de antes, de propósito: trocar a lista de parâmetros
-- obrigaria o PostgREST a recarregar o cache de esquema e derrubaria o
-- lançamento no intervalo. Só o corpo muda.
create or replace function public.registrar_despesa_aprovada(
    p_descricao text,
    p_categoria_id bigint,
    p_valor numeric,
    p_data date,
    p_vencimento date default null,
    p_forma_pagamento text default null,
    p_veiculo_id bigint default null,
    p_motorista_id bigint default null,
    p_protocolo text default null,
    p_observacoes text default null,
    p_natureza public.natureza_despesa default 'GERAL',
    p_paga boolean default false,
    p_data_pagamento date default null
)
returns public.despesas
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_despesa public.despesas;
    v_quem uuid := (select auth.uid());
begin
    perform public.exigir_administrador();

    if p_valor is null or p_valor <= 0 then
        raise exception 'Informe o valor da despesa.' using errcode = 'invalid_parameter_value';
    end if;
    if p_categoria_id is null then
        raise exception 'Informe a categoria da despesa.' using errcode = 'invalid_parameter_value';
    end if;

    insert into public.despesas (
        descricao, categoria_id, valor, data_lancamento, vencimento,
        forma_pagamento, veiculo_id, motorista_id, protocolo, observacoes,
        natureza, status, data_pagamento, aprovada, aprovado_por, aprovado_em, criado_por)
    values (
        p_descricao, p_categoria_id, p_valor, p_data, p_vencimento,
        p_forma_pagamento, p_veiculo_id, p_motorista_id, p_protocolo, p_observacoes,
        coalesce(p_natureza, 'GERAL'),
        (case when p_paga then 'PAGO' else 'PENDENTE' end)::public.status_despesa,
        -- A constraint `despesas_paga_tem_data` exige a data quando está paga.
        case when p_paga then coalesce(p_data_pagamento, p_data) else null end,
        true, v_quem, now(), v_quem)
    returning * into v_despesa;

    return v_despesa;
end;
$$;

