create index contas_receber_abertas_idx
    on contas_receber (vencimento, contratante_id)
    where status in ('PENDENTE', 'ATRASADO');

create index despesas_pendentes_idx
    on despesas (vencimento, categoria_id)
    where status in ('PENDENTE', 'ATRASADO') and aprovada = true;

create index receitas_periodo_idx on receitas (data_recebimento, status);
create index quilometragens_periodo_idx on quilometragens (data_registro, veiculo_id);
