create table clientes (
    id bigint generated always as identity primary key,
    nome text not null,
    telefone text not null,
    criado_em timestamp with time zone not null default current_timestamp
);

create table funcionarios (
    id bigint generated always as identity primary key,
    nome text not null,
    email text not null unique,
    perfil text not null,
    ativo boolean not null default true,
    criado_em timestamp with time zone not null default current_timestamp,
    constraint funcionarios_perfil_check
        check (perfil in ('ADMINISTRADOR', 'ATENDENTE', 'MOTORISTA'))
);

create table chamados (
    id bigint generated always as identity primary key,
    cliente_id bigint not null references clientes(id),
    funcionario_id bigint references funcionarios(id),
    veiculo text not null,
    placa text not null,
    origem text not null,
    destino text not null,
    tipo_servico text not null,
    valor numeric(12, 2) not null,
    observacoes text,
    status text not null,
    criado_em timestamp with time zone not null default current_timestamp,
    atualizado_em timestamp with time zone not null default current_timestamp,
    versao bigint not null default 0,
    constraint chamados_valor_check check (valor >= 0),
    constraint chamados_status_check
        check (status in ('ABERTO', 'EM_ANDAMENTO', 'CONCLUIDO', 'CANCELADO'))
);

create index chamados_cliente_id_idx on chamados (cliente_id);
create index chamados_funcionario_id_idx on chamados (funcionario_id);
create index chamados_status_criado_em_idx on chamados (status, criado_em desc);

