create index chamados_fila_ativa_idx on chamados (criado_em desc)
    where status in ('ABERTO', 'EM_ANDAMENTO');

