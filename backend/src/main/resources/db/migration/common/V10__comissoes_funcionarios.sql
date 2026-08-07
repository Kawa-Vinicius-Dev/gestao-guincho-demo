alter table motoristas add column qra text;
create unique index motoristas_qra_uk on motoristas(qra);

alter table ordens_servico_porto add column motorista_id bigint references motoristas(id);
alter table ordens_servico_porto add column motorista_vinculo_manual boolean not null default false;

update ordens_servico_porto os set motorista_id=(
    select max(m.id) from motoristas m
    where m.ativo=true and lower(trim(m.nome))=lower(trim(os.socorrista))
    having count(*)=1
)
where os.motorista_id is null and os.socorrista is not null and trim(os.socorrista)<>''
  and (select count(*) from motoristas m where m.ativo=true and lower(trim(m.nome))=lower(trim(os.socorrista)))=1;

create index ordens_servico_porto_motorista_idx on ordens_servico_porto(motorista_id);

alter table despesas add column natureza text not null default 'GERAL';
alter table despesas add constraint despesas_natureza_ck check (natureza in ('GERAL','ALIMENTACAO_FUNCIONARIO'));
create index despesas_motorista_natureza_data_idx on despesas(motorista_id,natureza,data_lancamento);
