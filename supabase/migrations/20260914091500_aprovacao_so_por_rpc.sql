-- Aprovar deixa de ser uma coluna que da para escrever.
--
-- Encontrado por teste adversarial: a regra "ninguem aprova o proprio
-- lancamento" vivia so dentro de `aprovar_despesa`. Mas a policy de UPDATE
-- deixava o administrador escrever em qualquer coluna de qualquer despesa —
-- entao bastava nao chamar a funcao:
--
--     update despesas set aprovada = true, aprovado_por = <eu>, aprovado_em = now()
--      where id = <minha propria despesa>;
--
-- Passava. E quem faz isso e exatamente quem a regra existe para conter: o
-- administrador reembolsando a si mesmo. Um controle que se desliga escrevendo
-- direto na tabela nao e um controle, e um aviso.
--
-- A correcao nao e outra checagem dentro da funcao — quem contorna a funcao nao
-- passaria por ela de qualquer jeito. E tirar essas colunas do alcance de quem
-- escreve: RLS filtra linhas, GRANT por coluna filtra colunas. As colunas de
-- aprovacao, de situacao e de comprovante saem do UPDATE concedido; quem ainda
-- as escreve sao as funcoes SECURITY DEFINER, que rodam como dono da tabela e
-- por isso nao passam pelo GRANT — e cada uma delas confere quem esta chamando.

revoke update on public.despesas from authenticated;

-- Correcao de cadastro continua livre para o administrador: descricao errada,
-- categoria trocada, valor digitado errado, viatura que faltou.
grant update (
    descricao, categoria_id, valor, data_lancamento, vencimento,
    forma_pagamento, natureza, veiculo_id, motorista_id,
    protocolo, observacoes, despesa_recorrente_id
) on public.despesas to authenticated;

-- Fora da lista, e de proposito:
--   status, aprovada, aprovado_por, aprovado_em  -> aprovar_despesa,
--                                                   rejeitar_despesa, pagar_despesa
--   comprovante_*                                -> registrar_comprovante,
--                                                   remover_comprovante
--   criado_por                                   -> ninguem. Quem lancou nao muda:
--                                                   e a coluna que a policy de
--                                                   leitura do FUNCIONARIO usa e
--                                                   que a segregacao compara.

-- Mesma historia nas contas a receber: receber e RPC, e a tela de correcao nao
-- precisa escrever o recebimento a mao.
revoke update on public.contas_receber from authenticated;
grant update (
    contratante_id, protocolo, descricao, valor_previsto, data_competencia,
    vencimento, veiculo_id, motorista_id, observacoes
) on public.contas_receber to authenticated;

-- E nos perfis: a policy ja so deixa o administrador escrever, mas sem recorte
-- de coluna ele poderia baixar a marca de senha provisoria de qualquer pessoa
-- sem que a senha fosse trocada — o que esvazia a tela de primeiro acesso.
revoke update on public.perfis from authenticated;
grant update (nome, perfil, ativo) on public.perfis to authenticated;

-- `senha_provisoria` fica para `concluir_troca_de_senha`, que exige que a senha
-- tenha sido trocada no Auth ha poucos minutos antes de baixar a marca.
