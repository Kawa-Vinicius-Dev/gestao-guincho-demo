-- Conciliacao do Porto: o que sobra depois de importar — pendencias, justificativas
-- de diferenca, rastro de eventos e o controle de registro ja lido.

-- Servico devolvido ou travado na Porto: entrou no relatorio mas nao vai virar
-- dinheiro enquanto nao for resolvido.
create table public.pendencias_porto (
    id bigint generated always as identity primary key,
    ordem_servico_id bigint not null references public.ordens_servico_porto (id) on delete cascade,
    tipo public.tipo_pendencia_porto not null default 'SERVICO_DEVOLVIDO',
    status public.status_pendencia_porto not null default 'ABERTA',
    valor numeric(12, 2) not null default 0,
    data_devolucao date not null,
    motivo text,
    observacao text,
    responsavel text,
    prazo date,
    referencia_porto text,
    importacao_id bigint references public.importacoes_porto (id) on delete set null,
    resolvido_por uuid references public.perfis (id) on delete set null,
    resolvido_em timestamptz,
    criado_em timestamptz not null default now(),
    atualizado_em timestamptz not null default now(),
    constraint pendencias_porto_valor_nao_negativo check (valor >= 0),
    constraint pendencias_porto_resolucao_coerente check (
        (status = 'RESOLVIDA' and resolvido_em is not null)
        or (status = 'ABERTA' and resolvido_em is null and resolvido_por is null)
    )
);

-- Uma OS tem no maximo uma pendencia aberta por vez.
create unique index pendencias_porto_uma_aberta_por_os
    on public.pendencias_porto (ordem_servico_id)
    where status = 'ABERTA';

-- Quando a OP paga diferente da soma das OSs, alguem explica por escrito por que.
-- E o que transforma "faltou dinheiro" em um numero auditavel.
create table public.justificativas_porto (
    id bigint generated always as identity primary key,
    ordem_pagamento_id bigint not null references public.ordens_pagamento_porto (id) on delete cascade,
    motivo public.motivo_justificativa_porto not null,
    observacao text,
    valor_diferenca numeric(12, 2),
    criado_por uuid not null references public.perfis (id) on delete restrict,
    criado_em timestamptz not null default now()
);

-- Rastro de eventos da OP/OS. Texto livre de proposito: os eventos nascem do
-- pipeline e um enum obrigaria migration a cada novo passo.
create table public.historico_porto (
    id bigint generated always as identity primary key,
    ordem_pagamento_id bigint references public.ordens_pagamento_porto (id) on delete cascade,
    ordem_servico_id bigint references public.ordens_servico_porto (id) on delete cascade,
    evento text not null,
    descricao text not null,
    criado_por uuid references public.perfis (id) on delete set null,
    criado_em timestamptz not null default now(),
    constraint historico_porto_tem_alvo check (
        ordem_pagamento_id is not null or ordem_servico_id is not null
    )
);

-- Linha ja absorvida de um arquivo. E o que faz reimportar o mesmo relatorio ser
-- inofensivo: a chave do registro ja esta aqui e ele e ignorado.
create table public.registros_importados_porto (
    id bigint generated always as identity primary key,
    importacao_id bigint not null references public.importacoes_porto (id) on delete cascade,
    hash_registro text not null,
    tipo_relatorio public.tipo_relatorio_porto not null,
    criado_em timestamptz not null default now()
);

create unique index registros_importados_porto_unico
    on public.registros_importados_porto (hash_registro, tipo_relatorio);

create trigger pendencias_porto_atualizado_em before update on public.pendencias_porto
    for each row execute function public.tocar_atualizado_em();
