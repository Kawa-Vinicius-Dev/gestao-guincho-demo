alter table pendencias_financeiras_porto add column motivo text;
alter table pendencias_financeiras_porto add column observacao text;
alter table pendencias_financeiras_porto add column responsavel text;
alter table pendencias_financeiras_porto add column prazo date;
alter table pendencias_financeiras_porto add column referencia_porto text;

create index pendencias_financeiras_porto_prazo_idx on pendencias_financeiras_porto(prazo);
