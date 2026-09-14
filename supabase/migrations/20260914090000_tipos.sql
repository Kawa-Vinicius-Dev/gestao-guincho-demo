-- Tipos do dominio.
--
-- O esquema antigo guardava todos estes valores como `text` + CHECK. Viraram enums
-- nativos por dois motivos: o CHECK vivia so em algumas colunas (as colunas novas de
-- status do Porto nao tinham nenhum, e aceitavam qualquer string), e o enum chega ao
-- PostgREST como string, entao o contrato que o frontend ja consome nao muda.
--
-- Acrescentar valor a um enum e `alter type ... add value`, que nao trava a tabela.

create type public.perfil_usuario as enum ('ADMINISTRADOR', 'FUNCIONARIO');

create type public.tipo_categoria as enum ('RECEITA', 'DESPESA');

create type public.origem_lancamento as enum ('MANUAL', 'IMPORTADA');

create type public.status_conta_receber as enum ('PENDENTE', 'RECEBIDO', 'ATRASADO', 'CANCELADO');

create type public.status_receita as enum ('PREVISTA', 'RECEBIDA', 'CANCELADA');

create type public.status_despesa as enum ('PENDENTE', 'PAGO', 'ATRASADO', 'REJEITADO');

-- Alimentacao do socorrista desconta da comissao; despesa geral nao. A distincao muda
-- o resultado por veiculo, entao mora na tabela e nao numa convencao de descricao.
create type public.natureza_despesa as enum ('GERAL', 'ALIMENTACAO_FUNCIONARIO');

create type public.status_importacao as enum (
    'PROCESSANDO', 'AGUARDANDO_CONFERENCIA', 'CONFIRMADA', 'CANCELADA', 'ERRO_LEITURA'
);

create type public.tipo_relatorio_porto as enum (
    'PREVISAO_RECEBER', 'SERVICOS_GERAIS', 'SERVICOS_AGUARDANDO_LANCAMENTO',
    'OS_VINCULADAS', 'SERVICOS_DEVOLVIDOS', 'PAINEL_DIARIO'
);

create type public.status_operacional_porto as enum (
    'NORMAL', 'AGUARDANDO_LANCAMENTO', 'PROCESSADO', 'LIBERADO_APOS_ANALISE',
    'PENDENTE_PORTO', 'DEVOLVIDO_FINALIZADO', 'CANCELADO'
);

create type public.status_financeiro_porto as enum (
    'AGUARDANDO_OP', 'PAGAMENTO_PROGRAMADO', 'A_CONFIRMAR', 'RECEBIDO',
    'BLOQUEADO_PARA_PAGAMENTO', 'VALOR_DIVERGENTE'
);

create type public.situacao_financeira_op as enum ('PROGRAMADO', 'A_CONFIRMAR', 'RECEBIDO');

create type public.motivo_justificativa_porto as enum (
    'SERVICO_NAO_INCLUIDO', 'DESCONTO', 'AJUSTE_PORTO', 'SERVICO_PENDENTE',
    'SERVICO_DEVOLVIDO', 'DIVERGENCIA_VALOR', 'OUTRO'
);

create type public.status_pendencia_porto as enum ('ABERTA', 'RESOLVIDA');

create type public.tipo_pendencia_porto as enum ('SERVICO_DEVOLVIDO', 'SERVICO_PENDENTE');
