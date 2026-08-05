alter table calendario_pagamentos_porto add column competencia_inicio date;
alter table calendario_pagamentos_porto add column competencia_fim date;

update calendario_pagamentos_porto set competencia_inicio='2026-07-01', competencia_fim='2026-07-15' where data_pagamento='2026-08-14';
update calendario_pagamentos_porto set competencia_inicio='2026-07-16', competencia_fim='2026-07-31' where data_pagamento='2026-08-28';
update calendario_pagamentos_porto set competencia_inicio='2026-08-01', competencia_fim='2026-08-15' where data_pagamento='2026-09-16';
update calendario_pagamentos_porto set competencia_inicio='2026-08-16', competencia_fim='2026-08-31' where data_pagamento='2026-09-30';
update calendario_pagamentos_porto set competencia_inicio='2026-09-01', competencia_fim='2026-09-15' where data_pagamento='2026-10-16';
update calendario_pagamentos_porto set competencia_inicio='2026-09-16', competencia_fim='2026-09-30' where data_pagamento='2026-10-30';
update calendario_pagamentos_porto set competencia_inicio='2026-10-01', competencia_fim='2026-10-15' where data_pagamento='2026-11-16';
update calendario_pagamentos_porto set competencia_inicio='2026-10-16', competencia_fim='2026-10-31' where data_pagamento='2026-11-30';
update calendario_pagamentos_porto set competencia_inicio='2026-11-01', competencia_fim='2026-11-15' where data_pagamento='2026-12-14';
update calendario_pagamentos_porto set competencia_inicio='2026-11-16', competencia_fim='2026-11-30' where data_pagamento='2026-12-30';

alter table calendario_pagamentos_porto add constraint calendario_porto_periodo_ck check (
    (competencia_inicio is null and competencia_fim is null)
    or (competencia_inicio is not null and competencia_fim is not null and competencia_inicio <= competencia_fim)
);
create unique index calendario_porto_periodo_uk on calendario_pagamentos_porto(competencia_inicio, competencia_fim);

alter table contas_receber add column ordem_servico_porto_id bigint references ordens_servico_porto(id);
alter table contas_receber add column ordem_pagamento_porto_id bigint references ordens_pagamento_porto(id);
alter table contas_receber add column motorista_id bigint references motoristas(id);

alter table receitas add column ordem_servico_porto_id bigint references ordens_servico_porto(id);
alter table receitas add column ordem_pagamento_porto_id bigint references ordens_pagamento_porto(id);
alter table receitas add column importacao_id bigint references importacoes(id);
alter table receitas add column motorista_id bigint references motoristas(id);

create unique index contas_receber_os_porto_uk on contas_receber(ordem_servico_porto_id);
create index contas_receber_op_porto_idx on contas_receber(ordem_pagamento_porto_id);
create index contas_receber_motorista_idx on contas_receber(motorista_id);
create unique index receitas_os_porto_uk on receitas(ordem_servico_porto_id);
create index receitas_op_porto_idx on receitas(ordem_pagamento_porto_id);
create index receitas_importacao_idx on receitas(importacao_id);
create index receitas_motorista_idx on receitas(motorista_id);

