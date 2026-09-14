-- Indices.
--
-- Tres origens, nesta ordem de prioridade:
--   1. colunas que as policies leem — sem indice, cada linha verificada e um
--      seq scan e o RLS vira o gargalo em vez da protecao;
--   2. os recortes de periodo do dashboard e do extrato, que sao a consulta mais
--      cara do sistema;
--   3. as FKs que as telas percorrem.
--
-- Indices parciais onde o filtro e sempre o mesmo: ocupam menos e cabem melhor no
-- plano Free, onde o que pesa e o tamanho do que precisa ficar em memoria.

-- --- lidos por policy ------------------------------------------------------
-- A policy do FUNCIONARIO em despesas filtra por criado_por a cada leitura.
create index despesas_criado_por_idx on public.despesas (criado_por);
create index favoritos_menu_perfil_idx on public.favoritos_menu (perfil_id);
create index oss_porto_motorista_idx on public.ordens_servico_porto (motorista_id);
create index pagamentos_comissao_motorista_idx on public.pagamentos_comissao (motorista_id);

-- --- recortes de periodo ---------------------------------------------------
-- O dashboard soma um intervalo de competencia e o extrato ordena por data.
create index contas_receber_competencia_idx on public.contas_receber (data_competencia);
create index contas_receber_vencimento_idx on public.contas_receber (vencimento);
create index receitas_competencia_idx on public.receitas (data_competencia);
create index despesas_lancamento_idx on public.despesas (data_lancamento);
create index quilometragens_data_idx on public.quilometragens (data_registro);

-- O resultado so conta despesa aprovada; o indice parcial evita percorrer as
-- pendentes de aprovacao, que nunca entram nessa soma.
create index despesas_aprovadas_por_data_idx
    on public.despesas (data_lancamento)
    where aprovada;

-- A fila de aprovacao e sempre "as que faltam", nunca a tabela inteira.
create index despesas_aguardando_aprovacao_idx
    on public.despesas (criado_em desc)
    where not aprovada and status <> 'REJEITADO';

-- Contas em aberto: o que a tela de cobranca abre por padrao.
create index contas_receber_em_aberto_idx
    on public.contas_receber (vencimento)
    where status in ('PENDENTE', 'ATRASADO');

-- --- FKs percorridas pelas telas -------------------------------------------
create index contas_receber_contratante_idx on public.contas_receber (contratante_id);
create index contas_receber_veiculo_idx on public.contas_receber (veiculo_id);
create index contas_receber_op_porto_idx on public.contas_receber (ordem_pagamento_porto_id);

create index receitas_contratante_idx on public.receitas (contratante_id);
create index receitas_categoria_idx on public.receitas (categoria_id);
create index receitas_veiculo_idx on public.receitas (veiculo_id);
create index receitas_motorista_idx on public.receitas (motorista_id);
create index receitas_conta_receber_idx on public.receitas (conta_receber_id);
create index receitas_op_porto_idx on public.receitas (ordem_pagamento_porto_id);

create index despesas_categoria_idx on public.despesas (categoria_id);
create index despesas_veiculo_idx on public.despesas (veiculo_id);
create index despesas_motorista_idx on public.despesas (motorista_id);
create index despesas_recorrente_idx on public.despesas (despesa_recorrente_id);

create index despesas_recorrentes_categoria_idx on public.despesas_recorrentes (categoria_id);

create index quilometragens_veiculo_idx on public.quilometragens (veiculo_id);
create index quilometragens_motorista_idx on public.quilometragens (motorista_id);

create index motoristas_veiculo_idx on public.motoristas (veiculo_id);

-- --- Porto ------------------------------------------------------------------
-- A OP carrega suas OSs em bloco; sem este indice cada OP aberta varre a tabela.
create index oss_porto_ordem_pagamento_idx on public.ordens_servico_porto (ordem_pagamento_id);
create index oss_porto_data_atendimento_idx on public.ordens_servico_porto (data_atendimento);
create index oss_porto_importacao_idx on public.ordens_servico_porto (importacao_id);

-- A producao do ciclo e sempre "as recebidas do periodo": e o que a comissao soma.
create index oss_porto_recebidas_por_data_idx
    on public.ordens_servico_porto (data_atendimento)
    where status_financeiro = 'RECEBIDO';

-- O painel de acompanhamento abre no que ainda nao virou dinheiro.
create index oss_porto_pendentes_idx
    on public.ordens_servico_porto (data_atendimento desc)
    where status_financeiro <> 'RECEBIDO';

create index ops_porto_calendario_idx on public.ordens_pagamento_porto (calendario_pagamento_id);
create index ops_porto_situacao_idx on public.ordens_pagamento_porto (situacao_financeira);
create index ops_porto_programada_idx on public.ordens_pagamento_porto (data_pagamento_programada);
create index ops_porto_importacao_idx on public.ordens_pagamento_porto (importacao_id);

create index pendencias_porto_os_idx on public.pendencias_porto (ordem_servico_id);
create index justificativas_porto_op_idx on public.justificativas_porto (ordem_pagamento_id);
create index historico_porto_op_idx on public.historico_porto (ordem_pagamento_id, criado_em desc);
create index historico_porto_os_idx on public.historico_porto (ordem_servico_id, criado_em desc);
create index registros_importados_porto_importacao_idx
    on public.registros_importados_porto (importacao_id);

create index calendario_porto_ativos_idx
    on public.calendario_pagamentos_porto (data_pagamento desc)
    where ativo;

create index pagamentos_comissao_calendario_idx
    on public.pagamentos_comissao (calendario_pagamento_id);
