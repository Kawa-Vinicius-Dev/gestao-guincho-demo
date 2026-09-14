-- Financeiro: contas a receber, receitas, despesas, despesas fixas e quilometragem.

create table public.contas_receber (
    id bigint generated always as identity primary key,
    contratante_id bigint not null references public.contratantes (id) on delete restrict,
    protocolo text,
    descricao text not null,
    valor_previsto numeric(12, 2) not null,
    valor_recebido numeric(12, 2),
    -- Competencia e o mes a que o valor pertence; vencimento e quando cai.
    -- O dashboard filtra por competencia, a cobranca olha o vencimento.
    data_competencia date not null,
    vencimento date not null,
    data_recebimento date,
    status public.status_conta_receber not null default 'PENDENTE',
    origem public.origem_lancamento not null default 'MANUAL',
    veiculo_id bigint references public.veiculos (id) on delete set null,
    motorista_id bigint references public.motoristas (id) on delete set null,
    observacoes text,
    importacao_id bigint references public.importacoes_porto (id) on delete set null,
    ordem_servico_porto_id bigint references public.ordens_servico_porto (id) on delete set null,
    ordem_pagamento_porto_id bigint references public.ordens_pagamento_porto (id) on delete set null,
    criado_em timestamptz not null default now(),
    atualizado_em timestamptz not null default now(),
    constraint contas_receber_valor_previsto_nao_negativo check (valor_previsto >= 0),
    constraint contas_receber_valor_recebido_nao_negativo check (valor_recebido is null or valor_recebido >= 0),
    constraint contas_receber_recebimento_completo check (
        status <> 'RECEBIDO' or (valor_recebido is not null and data_recebimento is not null)
    ),
    constraint contas_receber_descricao_nao_vazia check (length(btrim(descricao)) > 0)
);

-- Uma OS gera no maximo uma conta: reimportar o mesmo relatorio nao duplica caixa.
create unique index contas_receber_os_porto_unica
    on public.contas_receber (ordem_servico_porto_id)
    where ordem_servico_porto_id is not null;

create table public.receitas (
    id bigint generated always as identity primary key,
    descricao text not null,
    valor numeric(12, 2) not null,
    data_competencia date not null,
    data_recebimento date,
    status public.status_receita not null default 'PREVISTA',
    recorrente boolean not null default false,
    contratante_id bigint references public.contratantes (id) on delete set null,
    categoria_id bigint references public.categorias (id) on delete set null,
    veiculo_id bigint references public.veiculos (id) on delete set null,
    motorista_id bigint references public.motoristas (id) on delete set null,
    conta_receber_id bigint references public.contas_receber (id) on delete set null,
    importacao_id bigint references public.importacoes_porto (id) on delete set null,
    ordem_servico_porto_id bigint references public.ordens_servico_porto (id) on delete set null,
    ordem_pagamento_porto_id bigint references public.ordens_pagamento_porto (id) on delete set null,
    observacoes text,
    criado_em timestamptz not null default now(),
    atualizado_em timestamptz not null default now(),
    constraint receitas_valor_nao_negativo check (valor >= 0),
    constraint receitas_recebida_tem_data check (
        status <> 'RECEBIDA' or data_recebimento is not null
    ),
    constraint receitas_descricao_nao_vazia check (length(btrim(descricao)) > 0)
);

-- Receita nascida da Porto ou de importacao nao pode ser editada nem excluida a
-- mao — a regra existia so no servico Java e agora e uma coluna gerada, derivada
-- da origem, para a policy poder ler sem adivinhar.
alter table public.receitas
    add column manual boolean
    generated always as (
        ordem_servico_porto_id is null
        and ordem_pagamento_porto_id is null
        and importacao_id is null
    ) stored;

create unique index receitas_os_porto_unica
    on public.receitas (ordem_servico_porto_id)
    where ordem_servico_porto_id is not null;

create table public.despesas_recorrentes (
    id bigint generated always as identity primary key,
    descricao text not null,
    categoria_id bigint not null references public.categorias (id) on delete restrict,
    valor numeric(12, 2) not null,
    dia_vencimento integer not null,
    veiculo_id bigint references public.veiculos (id) on delete set null,
    motorista_id bigint references public.motoristas (id) on delete set null,
    observacoes text,
    ativo boolean not null default true,
    criado_em timestamptz not null default now(),
    atualizado_em timestamptz not null default now(),
    constraint despesas_recorrentes_valor_nao_negativo check (valor >= 0),
    constraint despesas_recorrentes_dia_valido check (dia_vencimento between 1 and 31),
    constraint despesas_recorrentes_descricao_nao_vazia check (length(btrim(descricao)) > 0)
);

create table public.despesas (
    id bigint generated always as identity primary key,
    descricao text not null,
    categoria_id bigint not null references public.categorias (id) on delete restrict,
    valor numeric(12, 2) not null,
    data_lancamento date not null,
    vencimento date,
    data_pagamento date,
    forma_pagamento text,
    status public.status_despesa not null default 'PENDENTE',
    -- Aprovacao e paga sao coisas diferentes: o socorrista lanca, o administrador
    -- aprova, e so depois de aprovada a despesa pode ser paga e entra no resultado.
    aprovada boolean not null default false,
    natureza public.natureza_despesa not null default 'GERAL',
    veiculo_id bigint references public.veiculos (id) on delete set null,
    motorista_id bigint references public.motoristas (id) on delete set null,
    despesa_recorrente_id bigint references public.despesas_recorrentes (id) on delete set null,
    protocolo text,
    observacoes text,
    -- Quem lancou. E por esta coluna que a policy do FUNCIONARIO enxerga so o
    -- proprio lancamento, e que a regra de aprovacao recusa aprovar a si mesmo.
    criado_por uuid not null references public.perfis (id) on delete restrict,
    aprovado_por uuid references public.perfis (id) on delete set null,
    aprovado_em timestamptz,
    -- Comprovante: objeto no bucket privado. `comprovante_arquivo` e o caminho.
    comprovante_arquivo text,
    comprovante_nome_original text,
    comprovante_content_type text,
    comprovante_tamanho_bytes bigint,
    criado_em timestamptz not null default now(),
    atualizado_em timestamptz not null default now(),
    constraint despesas_valor_nao_negativo check (valor >= 0),
    constraint despesas_descricao_nao_vazia check (length(btrim(descricao)) > 0),
    -- So despesa aprovada pode estar paga: sem isto, um UPDATE direto poria
    -- dinheiro no resultado sem passar pela aprovacao.
    constraint despesas_paga_exige_aprovacao check (status <> 'PAGO' or aprovada),
    constraint despesas_paga_tem_data check (status <> 'PAGO' or data_pagamento is not null),
    constraint despesas_aprovada_tem_autor check (
        (aprovada and aprovado_por is not null and aprovado_em is not null)
        or (not aprovada and aprovado_por is null and aprovado_em is null)
    ),
    constraint despesas_rejeitada_nao_aprovada check (status <> 'REJEITADO' or not aprovada),
    constraint despesas_comprovante_coerente check (
        comprovante_arquivo is not null
        or (comprovante_nome_original is null and comprovante_content_type is null
            and comprovante_tamanho_bytes is null)
    ),
    constraint despesas_comprovante_tamanho check (
        comprovante_tamanho_bytes is null
        or (comprovante_tamanho_bytes > 0 and comprovante_tamanho_bytes <= 10 * 1024 * 1024)
    ),
    constraint despesas_comprovante_tipo check (
        comprovante_content_type is null
        or comprovante_content_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')
    )
);

create table public.quilometragens (
    id bigint generated always as identity primary key,
    data_registro date not null,
    veiculo_id bigint not null references public.veiculos (id) on delete restrict,
    motorista_id bigint references public.motoristas (id) on delete set null,
    protocolo text,
    hodometro_inicial numeric(12, 2) not null,
    hodometro_final numeric(12, 2) not null,
    km_remunerado numeric(12, 2) not null default 0,
    -- Custo do km congelado no registro: se a tabela do veiculo mudar amanha, o
    -- custo do que ja aconteceu nao pode mudar junto.
    custo_por_km numeric(12, 4) not null,
    observacoes text,
    criado_por uuid references public.perfis (id) on delete set null,
    criado_em timestamptz not null default now(),
    atualizado_em timestamptz not null default now(),
    constraint quilometragens_hodometro_coerente check (hodometro_final >= hodometro_inicial),
    constraint quilometragens_km_remunerado_nao_negativo check (km_remunerado >= 0),
    constraint quilometragens_custo_nao_negativo check (custo_por_km >= 0),
    constraint quilometragens_remunerado_ate_total check (
        km_remunerado <= hodometro_final - hodometro_inicial
    )
);

-- km_total, km_morto e custo_km_morto eram tres colunas gravadas pelo Java, que
-- precisava recalcular as tres a cada alteracao. Viram colunas geradas: a conta
-- fica ao lado dos dados e nao ha como as tres discordarem entre si.
alter table public.quilometragens
    add column km_total numeric(12, 2)
        generated always as (hodometro_final - hodometro_inicial) stored,
    add column km_morto numeric(12, 2)
        generated always as (hodometro_final - hodometro_inicial - km_remunerado) stored,
    add column custo_km_morto numeric(12, 2)
        generated always as (
            round((hodometro_final - hodometro_inicial - km_remunerado) * custo_por_km, 2)
        ) stored;

create trigger contas_receber_atualizado_em before update on public.contas_receber
    for each row execute function public.tocar_atualizado_em();
create trigger receitas_atualizado_em before update on public.receitas
    for each row execute function public.tocar_atualizado_em();
create trigger despesas_atualizado_em before update on public.despesas
    for each row execute function public.tocar_atualizado_em();
create trigger despesas_recorrentes_atualizado_em before update on public.despesas_recorrentes
    for each row execute function public.tocar_atualizado_em();
create trigger quilometragens_atualizado_em before update on public.quilometragens
    for each row execute function public.tocar_atualizado_em();
