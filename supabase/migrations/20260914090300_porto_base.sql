-- Modulo Porto: calendario de pagamento, importacoes, OPs e OSs.
--
-- Vem antes do financeiro porque receita e conta a receber nascem daqui: quando
-- uma OP e conciliada, o pipeline cria a Receita correspondente. A seta aponta
-- Porto -> financeiro, nunca o contrario.

-- Ciclo de pagamento da Porto. A seguradora paga em datas fixas, e e o ciclo —
-- nao a data do atendimento — que define em qual mes o dinheiro entra e em qual
-- comissao o servico cai.
create table public.calendario_pagamentos_porto (
    id bigint generated always as identity primary key,
    data_pagamento date not null,
    descricao text not null,
    competencia_inicio date,
    competencia_fim date,
    -- Datas futuras entram estimadas e viram firmes quando a Porto publica.
    estimado boolean not null default false,
    ativo boolean not null default true,
    criado_em timestamptz not null default now(),
    atualizado_em timestamptz not null default now(),
    constraint calendario_porto_competencia_coerente check (
        (competencia_inicio is null and competencia_fim is null)
        or (competencia_inicio is not null and competencia_fim is not null
            and competencia_inicio <= competencia_fim)
    ),
    constraint calendario_porto_descricao_nao_vazia check (length(btrim(descricao)) > 0)
);

create unique index calendario_porto_data_unica
    on public.calendario_pagamentos_porto (data_pagamento);

-- Cada arquivo que a Porto entrega (CSV, TXT ou colagem do painel). Guarda o
-- resultado da conferencia para a tela mostrar o que mudou antes de confirmar.
create table public.importacoes_porto (
    id bigint generated always as identity primary key,
    nome_arquivo text not null,
    -- Hash do conteudo: reimportar o mesmo arquivo nao pode duplicar receita.
    hash_arquivo text not null,
    -- Caminho no bucket privado do Storage. O arquivo nunca fica no servidor.
    caminho_arquivo text,
    tipo_relatorio public.tipo_relatorio_porto,
    status public.status_importacao not null default 'PROCESSANDO',
    mensagem_erro text,
    total_registros integer not null default 0,
    registros_novos integer not null default 0,
    registros_atualizados integer not null default 0,
    registros_duplicados integer not null default 0,
    registros_divergentes integer not null default 0,
    registros_erros integer not null default 0,
    valor_total numeric(12, 2),
    criado_por uuid references public.perfis (id) on delete set null,
    criado_em timestamptz not null default now(),
    confirmado_em timestamptz,
    constraint importacoes_porto_contadores_nao_negativos check (
        total_registros >= 0 and registros_novos >= 0 and registros_atualizados >= 0
        and registros_duplicados >= 0 and registros_divergentes >= 0 and registros_erros >= 0
    )
);

create unique index importacoes_porto_hash_unico on public.importacoes_porto (hash_arquivo);

-- Ordem de pagamento: o lote que a Porto fecha e paga.
create table public.ordens_pagamento_porto (
    id bigint generated always as identity primary key,
    numero text not null,
    valor_total numeric(12, 2) not null default 0,
    nome_codigo text,
    data_pagamento_programada date,
    valor_recebido numeric(12, 2),
    data_recebimento date,
    situacao_financeira public.situacao_financeira_op not null default 'PROGRAMADO',
    status_porto text,
    observacao text,
    calendario_pagamento_id bigint references public.calendario_pagamentos_porto (id) on delete set null,
    importacao_id bigint references public.importacoes_porto (id) on delete set null,
    criado_em timestamptz not null default now(),
    atualizado_em timestamptz not null default now(),
    constraint ops_porto_valor_total_nao_negativo check (valor_total >= 0),
    constraint ops_porto_valor_recebido_nao_negativo check (valor_recebido is null or valor_recebido >= 0),
    -- Recebido exige valor e data: "recebido sem quanto" nao fecha caixa.
    constraint ops_porto_recebimento_completo check (
        situacao_financeira <> 'RECEBIDO'
        or (valor_recebido is not null and data_recebimento is not null)
    ),
    constraint ops_porto_numero_nao_vazio check (length(btrim(numero)) > 0)
);

create unique index ops_porto_numero_unico on public.ordens_pagamento_porto (upper(btrim(numero)));

-- Ordem de servico: o atendimento. Nasce do painel diario (sem valor, sem OP) e
-- ganha valor e OP semanas depois, quando a Porto fecha o pagamento.
create table public.ordens_servico_porto (
    id bigint generated always as identity primary key,
    numero text not null,
    -- A Porto escreve o mesmo numero de jeitos diferentes entre relatorios
    -- ("5632135/26", "563213526"). O normalizado e o que casa os dois.
    numero_normalizado text not null,
    ordem_pagamento_id bigint references public.ordens_pagamento_porto (id) on delete set null,
    valor_total numeric(12, 2) not null default 0,
    especialidade text,
    sigla_viatura text,
    -- Nome do socorrista como a Porto escreve, cortado pela largura da coluna de
    -- origem. Serve para leitura humana e nunca vincula motorista sozinho.
    socorrista text,
    qra text,
    motorista_id bigint references public.motoristas (id) on delete set null,
    -- Vinculo feito a mao pelo administrador nao pode ser desfeito por importacao.
    motorista_vinculo_manual boolean not null default false,
    data_atendimento date,
    data_hora_atendimento timestamptz,
    data_devolucao date,
    data_finalizacao_devolucao date,
    data_prevista_original date,
    data_efetiva_pagamento date,
    ciclos_atraso integer not null default 0,
    valor_km_excedente numeric(12, 2),
    km_morto_estimado numeric(12, 2),
    prestador text,
    seguradora text,
    cliente text,
    placa text,
    status_operacional public.status_operacional_porto not null default 'NORMAL',
    status_financeiro public.status_financeiro_porto not null default 'AGUARDANDO_OP',
    importacao_id bigint references public.importacoes_porto (id) on delete set null,
    data_importacao timestamptz not null default now(),
    criado_em timestamptz not null default now(),
    atualizado_em timestamptz not null default now(),
    constraint oss_porto_valor_total_nao_negativo check (valor_total >= 0),
    constraint oss_porto_ciclos_atraso_nao_negativo check (ciclos_atraso >= 0),
    constraint oss_porto_numero_nao_vazio check (length(btrim(numero)) > 0),
    -- Uma OS so pode estar RECEBIDO se pertence a uma OP: o dinheiro entra pela OP.
    constraint oss_porto_recebido_exige_op check (
        status_financeiro <> 'RECEBIDO' or ordem_pagamento_id is not null
    )
);

create unique index oss_porto_numero_normalizado_unico
    on public.ordens_servico_porto (numero_normalizado);

create trigger calendario_porto_atualizado_em before update on public.calendario_pagamentos_porto
    for each row execute function public.tocar_atualizado_em();
create trigger ops_porto_atualizado_em before update on public.ordens_pagamento_porto
    for each row execute function public.tocar_atualizado_em();
create trigger oss_porto_atualizado_em before update on public.ordens_servico_porto
    for each row execute function public.tocar_atualizado_em();
