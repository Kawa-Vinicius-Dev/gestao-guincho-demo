-- Cadastros base: o que as telas de lancamento oferecem nos seletores.

create table public.veiculos (
    id bigint generated always as identity primary key,
    identificacao text not null,
    placa text not null,
    modelo text,
    -- Custo por km tem 4 casas: e multiplicado por milhares de km e arredondar
    -- para centavos na origem faz o custo do km morto fechar errado no fim do mes.
    custo_por_km numeric(12, 4) not null default 0,
    -- Sigla com que a viatura aparece nos relatorios da Porto. E por ela que a
    -- importacao liga uma OS ao veiculo, entao e unica quando preenchida.
    sigla_porto text,
    ativo boolean not null default true,
    criado_em timestamptz not null default now(),
    atualizado_em timestamptz not null default now(),
    constraint veiculos_custo_por_km_nao_negativo check (custo_por_km >= 0),
    constraint veiculos_identificacao_nao_vazia check (length(btrim(identificacao)) > 0),
    constraint veiculos_placa_nao_vazia check (length(btrim(placa)) > 0)
);

create unique index veiculos_placa_unica on public.veiculos (upper(btrim(placa)));
create unique index veiculos_sigla_porto_unica
    on public.veiculos (upper(btrim(sigla_porto)))
    where sigla_porto is not null;

create table public.contratantes (
    id bigint generated always as identity primary key,
    nome text not null,
    documento text,
    ativo boolean not null default true,
    criado_em timestamptz not null default now(),
    atualizado_em timestamptz not null default now(),
    constraint contratantes_nome_nao_vazio check (length(btrim(nome)) > 0)
);

-- O pipeline da Porto procura o contratante "Porto Seguro" pelo nome, ignorando
-- caixa, e cria se nao achar. Sem unicidade, dois acentos diferentes viram dois
-- contratantes e o faturamento se divide entre eles.
create unique index contratantes_nome_unico on public.contratantes (lower(btrim(nome)));

create table public.categorias (
    id bigint generated always as identity primary key,
    nome text not null,
    tipo public.tipo_categoria not null,
    ativo boolean not null default true,
    criado_em timestamptz not null default now(),
    atualizado_em timestamptz not null default now(),
    constraint categorias_nome_nao_vazio check (length(btrim(nome)) > 0)
);

-- Mesmo nome pode existir nos dois tipos ("Comissao" entra como receita e como
-- despesa), mas nao duas vezes dentro do mesmo tipo.
create unique index categorias_nome_por_tipo_unico
    on public.categorias (lower(btrim(nome)), tipo);

create table public.motoristas (
    id bigint generated always as identity primary key,
    nome text not null,
    telefone text,
    documento text,
    -- QRA e o indicativo do socorrista nos relatorios da Porto.
    qra text,
    -- Viatura habitual. E dela que a importacao parte para adivinhar quem atendeu
    -- uma OS que veio sem QRA.
    veiculo_id bigint references public.veiculos (id) on delete set null,
    -- Nem todo socorrista tem login. Quando tem, e este vinculo que faz
    -- /minha-comissao saber de quem e a comissao.
    perfil_id uuid unique references public.perfis (id) on delete set null,
    ativo boolean not null default true,
    criado_em timestamptz not null default now(),
    atualizado_em timestamptz not null default now(),
    constraint motoristas_nome_nao_vazio check (length(btrim(nome)) > 0)
);

create unique index motoristas_qra_unico
    on public.motoristas (upper(btrim(qra)))
    where qra is not null;

create trigger veiculos_atualizado_em before update on public.veiculos
    for each row execute function public.tocar_atualizado_em();
create trigger contratantes_atualizado_em before update on public.contratantes
    for each row execute function public.tocar_atualizado_em();
create trigger categorias_atualizado_em before update on public.categorias
    for each row execute function public.tocar_atualizado_em();
create trigger motoristas_atualizado_em before update on public.motoristas
    for each row execute function public.tocar_atualizado_em();

-- ---------------------------------------------------------------------------
-- Quem sou eu, como socorrista
-- ---------------------------------------------------------------------------
--
-- Usada pelas policies que liberam a um FUNCIONARIO so o que e dele: a propria
-- comissao, as proprias OSs. SECURITY DEFINER porque `motoristas` tem RLS e uma
-- policy que a consultasse por aqui entraria em recursao.

create or replace function public.motorista_atual()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
    select m.id
    from public.motoristas m
    where m.perfil_id = (select auth.uid())
      and m.ativo
$$;

comment on function public.motorista_atual() is
    'Id do motorista vinculado a quem chama, ou null se nao houver vinculo.';
