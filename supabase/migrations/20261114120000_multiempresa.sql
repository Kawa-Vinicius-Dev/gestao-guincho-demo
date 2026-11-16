-- Multiempresa (14/11/2026).
--
-- Ate aqui o sistema era de um cliente so: toda linha do banco era dele, e as
-- policies so perguntavam "e administrador?". Para vender a outras empresas de
-- guincho no MESMO banco, cada linha passa a dizer de qual empresa e, e o banco
-- recusa qualquer leitura ou escrita fora da empresa de quem esta logado.
--
-- Como o isolamento e montado (quatro camadas, todas no banco):
--
--   1. `empresas` + coluna `empresa_id` em TODAS as tabelas de dados. Ela nasce
--      preenchida sozinha (default `empresa_atual()`), entao nenhuma tela ou
--      funcao existente precisa informar a empresa ao gravar.
--   2. Uma policy RESTRITIVA por tabela: `empresa_id = empresa_atual()`. Policy
--      restritiva soma com AND a todas as outras, entao as ~100 policies que ja
--      existiam continuam decidindo "quem dentro da empresa", e esta decide
--      "qual empresa". Uma policy nova que alguem esqueca de filtrar continua
--      presa a empresa.
--   3. As funcoes SECURITY DEFINER (dashboard, DRE, comissao, conciliacao...)
--      rodavam como dono das tabelas e, por isso, ignoravam RLS: veriam todas as
--      empresas somadas. Em vez de reescrever uma a uma, elas passam a pertencer
--      ao papel `funcoes_internas`, que NAO ignora RLS e so enxerga a empresa de
--      quem chamou. Funcao nova que esqueca disso e pega pela suite 99t.
--   4. Um gatilho recusa apontar para registro de outra empresa (ex.: despesa da
--      empresa A com a viatura da empresa B), porque chave estrangeira nao passa
--      por RLS e os ids sao sequenciais.
--
-- O cliente atual vira a empresa nº 1 e fica com tudo o que ja existe.
--
-- Quem e quem:
--   - gestor      = perfil ADMINISTRADOR, enxerga a empresa inteira dele;
--   - socorrista  = perfil FUNCIONARIO, como ja era;
--   - desenvolvedor (ANAIV) = tabela `desenvolvedores`, sem perfil em empresa
--     nenhuma: cria empresas, ve contagens e bloqueia, mas nao le dado de cliente.

-- ---------------------------------------------------------------------------
-- 1. Empresas e desenvolvedores
-- ---------------------------------------------------------------------------

create table public.empresas (
    id uuid primary key default gen_random_uuid(),
    nome text not null check (btrim(nome) <> ''),
    -- Vai no link publico de avaliacao (/avaliar?e=codigo): curto e sem acento.
    codigo text not null check (codigo ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
    ativa boolean not null default true,
    bloqueada_em timestamptz,
    motivo_bloqueio text,
    criado_em timestamptz not null default now(),
    atualizado_em timestamptz not null default now()
);
create unique index empresas_codigo_unico on public.empresas (codigo);
create unique index empresas_nome_unico on public.empresas (lower(btrim(nome)));
create trigger empresas_atualizado_em before update on public.empresas
    for each row execute function public.tocar_atualizado_em();
alter table public.empresas enable row level security;

-- A empresa nº 1: o cliente que ja usa o sistema. Id fixo para os dados
-- existentes serem carimbados logo abaixo sem depender de consulta.
insert into public.empresas (id, nome, codigo)
values ('00000000-0000-0000-0000-000000000001', 'JMS', 'jms');

create table public.desenvolvedores (
    usuario_id uuid primary key references auth.users (id) on delete cascade,
    nome text,
    criado_em timestamptz not null default now()
);
-- RLS ligado e sem policy: ninguem le nem escreve pela API. So as funcoes
-- abaixo consultam, e incluir alguem aqui e feito por SQL, de proposito.
alter table public.desenvolvedores enable row level security;
revoke all on public.desenvolvedores from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Quem e a empresa de quem esta pedindo
-- ---------------------------------------------------------------------------

alter table public.perfis
    add column empresa_id uuid not null default '00000000-0000-0000-0000-000000000001'
        references public.empresas (id);
alter table public.perfis alter column empresa_id drop default;
create index perfis_empresa_idx on public.perfis (empresa_id);

-- A empresa sai do cadastro de quem esta logado, nunca de algo que o navegador
-- escreve. Conta desligada ou empresa bloqueada nao tem empresa: toda policy
-- restritiva vira falso e a pessoa nao ve nada.
--
-- Sem usuario (agendador do banco, suites de teste) vale `app.empresa_id`. A
-- API nao tem como definir essa variavel, e ela e ignorada sempre que ha login.
create or replace function public.empresa_atual()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
    select case
        when (select auth.uid()) is not null then (
            select p.empresa_id
              from public.perfis p
              join public.empresas e on e.id = p.empresa_id
             where p.id = (select auth.uid()) and p.ativo and e.ativa
        )
        else nullif(current_setting('app.empresa_id', true), '')::uuid
    end
$$;

-- Empresa bloqueada: o perfil deixa de valer, entao tudo o que pergunta
-- "e administrador?" ou "e operador?" responde nao.
create or replace function public.perfil_atual()
returns public.perfil_usuario
language sql
stable
security definer
set search_path = ''
as $$
    select p.perfil
      from public.perfis p
      join public.empresas e on e.id = p.empresa_id
     where p.id = (select auth.uid())
       and p.ativo
       and e.ativa
$$;

create or replace function public.e_operador()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
          from public.perfis p
          join public.empresas e on e.id = p.empresa_id
         where p.id = (select auth.uid())
           and p.ativo
           and not p.senha_provisoria
           and e.ativa
    )
$$;

create or replace function public.e_desenvolvedor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (select 1 from public.desenvolvedores d where d.usuario_id = (select auth.uid()))
$$;

create or replace function public.exigir_desenvolvedor()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
    if not public.e_desenvolvedor() then
        raise exception 'Acesso restrito à ANAIV.' using errcode = 'insufficient_privilege';
    end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. O papel que executa as funcoes privilegiadas sem ignorar RLS
-- ---------------------------------------------------------------------------

do $$
begin
    if not exists (select 1 from pg_roles where rolname = 'funcoes_internas') then
        create role funcoes_internas nologin;
    end if;
end $$;

-- Quem aplica as migrations precisa poder entregar funcoes a ele e, depois,
-- dar `create or replace` nelas.
grant funcoes_internas to current_user;
-- Herda o que `authenticated` alcanca fora do schema public (auth.uid()).
grant authenticated to funcoes_internas;
grant usage, create on schema public to funcoes_internas;
grant all on all tables in schema public to funcoes_internas;
grant all on all sequences in schema public to funcoes_internas;
grant execute on all functions in schema public to funcoes_internas;
alter default privileges in schema public grant all on tables to funcoes_internas;
alter default privileges in schema public grant all on sequences to funcoes_internas;
alter default privileges in schema public grant execute on functions to funcoes_internas;
-- A lista de desenvolvedores nao e assunto das funcoes de empresa.
revoke all on public.desenvolvedores from funcoes_internas;

-- ---------------------------------------------------------------------------
-- 4. `empresa_id` em todas as tabelas de dados + policy restritiva
-- ---------------------------------------------------------------------------

do $$
declare
    t text;
begin
    for t in
        select c.relname
          from pg_class c
         where c.relnamespace = 'public'::regnamespace
           and c.relkind = 'r'
           and c.relname not in ('empresas', 'desenvolvedores')
         order by c.relname
    loop
        if t <> 'perfis' then
            -- Default constante primeiro: carimba o que ja existe como empresa nº 1
            -- sem reescrever a tabela. Depois o default vira "a empresa de quem grava".
            execute format(
                'alter table public.%I add column empresa_id uuid not null
                   default ''00000000-0000-0000-0000-000000000001'' references public.empresas (id)', t);
            execute format('create index %I on public.%I (empresa_id)', t || '_empresa_idx', t);
        end if;
        execute format('alter table public.%I alter column empresa_id set default public.empresa_atual()', t);

        execute format('alter table public.%I enable row level security', t);
        execute format(
            'create policy mesma_empresa on public.%I as restrictive for all to public
               using (empresa_id = (select public.empresa_atual()))
               with check (empresa_id = (select public.empresa_atual()))', t);
        -- Dentro da empresa, as funcoes privilegiadas continuam podendo tudo o
        -- que ja podiam; quem confere o perfil e cada funcao, como sempre foi.
        execute format(
            'create policy funcoes_internas_tudo on public.%I for all to funcoes_internas
               using (true) with check (true)', t);
    end loop;
end $$;

-- A propria empresa: cada um le so a sua (nome na tela, codigo do link de avaliacao).
create policy empresas_leitura on public.empresas
    for select to authenticated, funcoes_internas
    using (id = (select public.empresa_atual()));
grant select on public.empresas to authenticated;

-- ---------------------------------------------------------------------------
-- 5. O que era unico no sistema passa a ser unico por empresa
-- ---------------------------------------------------------------------------
-- Duas empresas podem ter a categoria "Combustível", a viatura "L01" ou a mesma
-- data no calendario. O e-mail de login continua unico no sistema inteiro.

drop index public.veiculos_placa_unica;
create unique index veiculos_placa_unica on public.veiculos (empresa_id, upper(btrim(placa)));

drop index public.veiculos_sigla_porto_unica;
create unique index veiculos_sigla_porto_unica on public.veiculos (empresa_id, upper(btrim(sigla_porto)))
    where sigla_porto is not null;

drop index public.contratantes_nome_unico;
create unique index contratantes_nome_unico on public.contratantes (empresa_id, lower(btrim(nome)));

drop index public.categorias_nome_por_tipo_unico;
create unique index categorias_nome_por_tipo_unico on public.categorias (empresa_id, lower(btrim(nome)), tipo);

drop index public.motoristas_qra_unico;
create unique index motoristas_qra_unico on public.motoristas (empresa_id, upper(btrim(qra)))
    where qra is not null;

drop index public.ops_porto_numero_unico;
create unique index ops_porto_numero_unico on public.ordens_pagamento_porto (empresa_id, upper(btrim(numero)));

drop index public.calendario_porto_data_unica;
create unique index calendario_porto_data_unica on public.calendario_pagamentos_porto (empresa_id, data_pagamento);

drop index public.importacoes_porto_hash_unico;
create unique index importacoes_porto_hash_unico on public.importacoes_porto (empresa_id, hash_arquivo);

drop index public.oss_porto_numero_normalizado_unico;
create unique index oss_porto_numero_normalizado_unico on public.ordens_servico_porto (empresa_id, numero_normalizado);

drop index public.registros_importados_porto_unico;
create unique index registros_importados_porto_unico
    on public.registros_importados_porto (empresa_id, hash_registro, tipo_relatorio);

drop index public.porto_tabela_precos_uma_por_especialidade;
create unique index porto_tabela_precos_uma_por_especialidade
    on public.porto_tabela_precos (empresa_id, upper(btrim(especialidade)));

alter table public.dias_diario_porto drop constraint dias_diario_porto_pkey;
alter table public.dias_diario_porto add primary key (empresa_id, dia);

-- Era uma tabela de uma linha so (chave `id = true`). Agora e uma linha por
-- empresa; a coluna `id` fica porque as funcoes filtram por ela (`where id`).
alter table public.configuracao_comissao drop constraint configuracao_comissao_pkey;
alter table public.configuracao_comissao add primary key (empresa_id);

-- A importacao da Porto grava com ON CONFLICT nos indices acima. O alvo do
-- conflito tem que casar com o indice novo, senao a importacao para com "no
-- unique constraint matching". So essas quatro clausulas mudam; o resto da
-- funcao (300 linhas) fica como esta. Se alguma delas nao for encontrada, a
-- migration para, em vez de deixar a funcao pela metade.
do $$
declare
    v_def text;
    par text[];
    pares text[][] := array[
        ['on conflict (upper(btrim(numero))) do update', 'on conflict (empresa_id, upper(btrim(numero))) do update'],
        ['on conflict (numero_normalizado) do update', 'on conflict (empresa_id, numero_normalizado) do update'],
        ['on conflict (hash_registro, tipo_relatorio) do nothing', 'on conflict (empresa_id, hash_registro, tipo_relatorio) do nothing'],
        ['on conflict (dia) do update', 'on conflict (empresa_id, dia) do update']
    ];
begin
    select pg_get_functiondef(p.oid) into strict v_def
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.proname = 'porto_confirmar_importacao';

    foreach par slice 1 in array pares loop
        if position(par[1] in v_def) = 0 then
            raise exception 'porto_confirmar_importacao mudou: não achei "%".', par[1];
        end if;
        v_def := replace(v_def, par[1], par[2]);
    end loop;
    execute v_def;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Nada aponta para registro de outra empresa
-- ---------------------------------------------------------------------------
-- A chave estrangeira confere se o registro existe, mas nao passa por RLS: sem
-- isto, o gestor da empresa A gravaria uma despesa apontando para a viatura 7,
-- que e da empresa B. Ele nao leria a viatura, mas travaria a exclusao dela e
-- sujaria os relatorios. Um gatilho por tabela confere cada referencia.

create or replace function public.validar_mesma_empresa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    i integer := 0;
    v_novo jsonb := to_jsonb(new);
    v_antigo jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end;
    v_valor text;
    v_empresa uuid;
begin
    -- Argumentos em grupos de quatro: coluna, tabela apontada, coluna apontada, tipo.
    while i < tg_nargs loop
        v_valor := v_novo ->> tg_argv[i];
        if v_valor is not null
           and (v_antigo is null
                or v_valor is distinct from (v_antigo ->> tg_argv[i])
                or new.empresa_id is distinct from old.empresa_id) then
            execute format('select empresa_id from public.%I where %I = $1::%s',
                           tg_argv[i + 1], tg_argv[i + 2], tg_argv[i + 3])
               into v_empresa using v_valor;
            -- Registro inexistente fica com a chave estrangeira, que ja recusa.
            if v_empresa is not null and v_empresa is distinct from new.empresa_id then
                raise exception 'Este registro pertence a outra empresa.'
                    using errcode = 'foreign_key_violation';
            end if;
        end if;
        i := i + 4;
    end loop;
    return new;
end;
$$;

do $$
declare
    r record;
begin
    for r in
        select c.conrelid::regclass::text as filha,
               string_agg(format('%L, %L, %L, %L',
                   a.attname, pai.relname, ap.attname, format_type(ap.atttypid, null)), ', '
                   order by c.conname) as argumentos
          from pg_constraint c
          join pg_class pai on pai.oid = c.confrelid
          join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
          join pg_attribute ap on ap.attrelid = c.confrelid and ap.attnum = c.confkey[1]
         where c.contype = 'f'
           and c.connamespace = 'public'::regnamespace
           and pai.relnamespace = 'public'::regnamespace
           and pai.relname <> 'empresas'
           and array_length(c.conkey, 1) = 1
         group by c.conrelid
    loop
        execute format(
            'create trigger mesma_empresa before insert or update on %s
               for each row execute function public.validar_mesma_empresa(%s)',
            r.filha, r.argumentos);
    end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Contas de acesso: a empresa vem de onde o usuario nao escreve
-- ---------------------------------------------------------------------------
-- `raw_user_meta_data` e editavel pelo proprio usuario; `raw_app_meta_data` so
-- pela service_role (a Edge Function `admin-usuarios`). A empresa sai dali.
-- Conta criada sem empresa (o login do desenvolvedor, no painel do Supabase)
-- nao ganha perfil: existe no Auth e nao alcanca dado de empresa nenhuma.

create or replace function public.provisionar_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_app jsonb := to_jsonb(new) -> 'raw_app_meta_data';
    v_empresa uuid := coalesce(nullif(v_app ->> 'empresa_id', '')::uuid, public.empresa_atual());
begin
    if v_empresa is null then
        return new;
    end if;

    insert into public.perfis (id, nome, email, perfil, senha_provisoria, empresa_id)
    values (
        new.id,
        coalesce(nullif(btrim(new.raw_user_meta_data ->> 'nome'), ''), split_part(new.email, '@', 1)),
        new.email,
        coalesce((v_app ->> 'perfil')::public.perfil_usuario,
                 (new.raw_user_meta_data ->> 'perfil')::public.perfil_usuario, 'FUNCIONARIO'),
        coalesce((new.raw_user_meta_data ->> 'senha_provisoria')::boolean, false),
        v_empresa
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

-- Para a tela de login explicar por que alguem sem perfil nao entrou, e para
-- mandar o desenvolvedor ao painel dele.
create or replace function public.situacao_do_acesso()
returns text
language sql
stable
security definer
set search_path = ''
as $$
    select case
        when (select auth.uid()) is null then 'SEM_ACESSO'
        when public.e_desenvolvedor() then 'DESENVOLVEDOR'
        when exists (
            select 1 from public.perfis p join public.empresas e on e.id = p.empresa_id
             where p.id = (select auth.uid()) and p.ativo and not e.ativa
        ) then 'EMPRESA_BLOQUEADA'
        when public.empresa_atual() is not null then 'ATIVO'
        else 'SEM_ACESSO'
    end
$$;
revoke all on function public.situacao_do_acesso() from public, anon;
grant execute on function public.situacao_do_acesso() to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Avaliacao publica: o link diz de qual empresa e
-- ---------------------------------------------------------------------------
-- /avaliar nao tem login, entao a empresa vem no link (/avaliar?e=codigo). O
-- link antigo, sem codigo, e o que o primeiro cliente ja distribuiu: continua
-- valendo para ele.

drop function public.avaliar(integer, text, text, text);

create or replace function public.avaliar(
    p_nota integer, p_nome text, p_placa text, p_comentario text, p_empresa text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_empresa uuid;
begin
    if p_nota is null or p_nota not between 1 and 5 then
        raise exception 'Escolha uma nota de 1 a 5.' using errcode = 'check_violation';
    end if;

    if nullif(btrim(p_empresa), '') is null then
        select e.id into v_empresa from public.empresas e
         where e.ativa and e.id = '00000000-0000-0000-0000-000000000001';
    else
        select e.id into v_empresa from public.empresas e
         where e.ativa and e.codigo = lower(btrim(p_empresa));
    end if;
    if v_empresa is null then
        raise exception 'Link de avaliação inválido.' using errcode = 'invalid_parameter_value';
    end if;

    insert into public.avaliacoes (nota, nome, placa, comentario, empresa_id)
    values (
        p_nota,
        nullif(left(btrim(p_nome), 80), ''),
        nullif(upper(left(btrim(p_placa), 10)), ''),
        nullif(left(btrim(p_comentario), 1000), ''),
        v_empresa
    );
end;
$$;
revoke all on function public.avaliar(integer, text, text, text, text) from public;
grant execute on function public.avaliar(integer, text, text, text, text) to anon, authenticated;

-- A pagina publica mostra de quem e a avaliacao. So o nome, e so de empresa ativa.
create or replace function public.empresa_do_link(p_codigo text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
    select e.nome from public.empresas e
     where e.ativa and e.codigo = lower(btrim(p_codigo))
$$;
revoke all on function public.empresa_do_link(text) from public;
grant execute on function public.empresa_do_link(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 9. Despesas fixas automaticas: uma passada por empresa
-- ---------------------------------------------------------------------------
-- O agendador roda sem usuario, logo sem empresa. Ele percorre as empresas
-- ativas e roda a funcao de sempre com a empresa da vez.

create or replace function public.lancar_fixas_de_todas_as_empresas(p_hoje date default current_date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    e record;
    v_total integer := 0;
begin
    if (select auth.uid()) is not null then
        raise exception 'Só o agendador do banco chama isto.' using errcode = 'insufficient_privilege';
    end if;

    for e in select id from public.empresas where ativa order by criado_em loop
        perform set_config('app.empresa_id', e.id::text, true);
        v_total := v_total + public.lancar_fixas_vencidas(p_hoje);
    end loop;
    perform set_config('app.empresa_id', '', true);
    return v_total;
end;
$$;
revoke all on function public.lancar_fixas_de_todas_as_empresas(date) from public, anon, authenticated;

do $$
begin
    if exists (select 1 from pg_extension where extname = 'pg_cron') then
        perform cron.unschedule(jobid) from cron.job where jobname = 'lancar-fixas-vencidas';
        perform cron.schedule('lancar-fixas-vencidas', '15 9 * * *',
                              'select public.lancar_fixas_de_todas_as_empresas()');
    end if;
end $$;

-- ---------------------------------------------------------------------------
-- 10. Arquivos: o caminho tem que levar a um registro da propria empresa
-- ---------------------------------------------------------------------------
-- As policies de arquivo liberavam "e administrador" sem olhar de quem era o
-- arquivo. Com mais de uma empresa, isso deixaria o gestor de uma abrir o
-- comprovante da outra. Agora o caminho (despesas/<id>/..., turnos/<id>/...)
-- precisa apontar para um registro que a pessoa enxerga, e quem decide isso sao
-- as policies de `despesas` e `turnos`, ja presas a empresa.

-- Relatorios da Porto: porto/<id da importacao>/arquivo.
create or replace function public.importacao_do_caminho(p_caminho text)
returns bigint
language sql
immutable
set search_path = ''
as $$
    select case
        when p_caminho like 'porto/%'
             and split_part(p_caminho, '/', 2) ~ '^[0-9]+$'
        then split_part(p_caminho, '/', 2)::bigint
    end
$$;

drop policy if exists comprovantes_leitura on storage.objects;
create policy comprovantes_leitura on storage.objects
    for select to authenticated
    using (
        bucket_id = 'comprovantes'
        and (
            exists (select 1 from public.despesas d
                     where d.id = public.despesa_do_caminho(name))
            -- Relatorios da Porto de antes do bucket proprio ficaram aqui.
            or ((select public.e_administrador())
                and exists (select 1 from public.importacoes_porto i
                             where i.id = public.importacao_do_caminho(name)))
        )
    );

drop policy if exists comprovantes_envio on storage.objects;
create policy comprovantes_envio on storage.objects
    for insert to authenticated
    with check (
        bucket_id = 'comprovantes'
        and (select public.e_operador())
        and (
            exists (select 1 from public.despesas d
                     where d.id = public.despesa_do_caminho(name))
            or ((select public.e_administrador())
                and exists (select 1 from public.turnos t
                             where t.id = public.turno_do_caminho(name)))
        )
    );

drop policy if exists comprovantes_remocao on storage.objects;
create policy comprovantes_remocao on storage.objects
    for delete to authenticated
    using (
        bucket_id = 'comprovantes'
        and (
            exists (select 1 from public.despesas d
                     where d.id = public.despesa_do_caminho(name))
            or ((select public.e_administrador())
                and exists (select 1 from public.turnos t
                             where t.id = public.turno_do_caminho(name)))
        )
    );

drop policy if exists turnos_fotos_leitura on storage.objects;
create policy turnos_fotos_leitura on storage.objects
    for select to authenticated
    using (
        bucket_id = 'comprovantes'
        and name like 'turnos/%'
        and exists (select 1 from public.turnos t
                     where t.id = public.turno_do_caminho(name))
    );

drop policy if exists porto_arquivos_admin on storage.objects;
drop policy if exists porto_arquivos_leitura on storage.objects;
drop policy if exists porto_arquivos_envio on storage.objects;
drop policy if exists porto_arquivos_remocao on storage.objects;

create policy porto_arquivos_leitura on storage.objects
    for select to authenticated
    using (
        bucket_id = 'importacoes-porto'
        and (select public.e_administrador())
        and exists (select 1 from public.importacoes_porto i
                     where i.id = public.importacao_do_caminho(name))
    );
create policy porto_arquivos_envio on storage.objects
    for insert to authenticated
    with check (
        bucket_id = 'importacoes-porto'
        and (select public.e_administrador())
        and exists (select 1 from public.importacoes_porto i
                     where i.id = public.importacao_do_caminho(name))
    );
create policy porto_arquivos_remocao on storage.objects
    for delete to authenticated
    using (
        bucket_id = 'importacoes-porto'
        and (select public.e_administrador())
        and exists (select 1 from public.importacoes_porto i
                     where i.id = public.importacao_do_caminho(name))
    );

-- ---------------------------------------------------------------------------
-- 11. Painel do desenvolvedor (ANAIV)
-- ---------------------------------------------------------------------------
-- So contagens e dados de conta (nome, e-mail, ultimo acesso). Nada de receita,
-- despesa, OS ou cliente: o desenvolvedor nao tem perfil em empresa nenhuma, e
-- as funcoes abaixo nao devolvem dado de operacao.

create or replace function public.plataforma_empresas()
returns table (
    id uuid, nome text, codigo text, ativa boolean,
    criado_em timestamptz, bloqueada_em timestamptz, motivo_bloqueio text,
    gestores bigint, usuarios_ativos bigint, usuarios_total bigint,
    socorristas bigint, viaturas bigint, ultimo_acesso timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    perform public.exigir_desenvolvedor();
    return query
    select e.id, e.nome, e.codigo, e.ativa, e.criado_em, e.bloqueada_em, e.motivo_bloqueio,
           (select count(*) from public.perfis p
             where p.empresa_id = e.id and p.ativo and p.perfil = 'ADMINISTRADOR'),
           (select count(*) from public.perfis p where p.empresa_id = e.id and p.ativo),
           (select count(*) from public.perfis p where p.empresa_id = e.id),
           (select count(*) from public.motoristas m where m.empresa_id = e.id and m.ativo),
           (select count(*) from public.veiculos v where v.empresa_id = e.id),
           (select max(u.last_sign_in_at) from auth.users u
              join public.perfis p on p.id = u.id where p.empresa_id = e.id)
      from public.empresas e
     order by e.criado_em;
end;
$$;

create or replace function public.plataforma_usuarios(p_empresa uuid)
returns table (
    id uuid, nome text, email text, perfil public.perfil_usuario,
    ativo boolean, senha_provisoria boolean, criado_em timestamptz, ultimo_acesso timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    perform public.exigir_desenvolvedor();
    return query
    select p.id, p.nome, p.email, p.perfil, p.ativo, p.senha_provisoria, p.criado_em, u.last_sign_in_at
      from public.perfis p
      left join auth.users u on u.id = p.id
     where p.empresa_id = p_empresa
     order by p.perfil, p.nome;
end;
$$;

-- Cria a empresa com o minimo para ela abrir util: as mesmas categorias e o
-- contratante que o primeiro cliente recebeu no seed, e a linha da comissao.
-- O primeiro gestor e criado em seguida pela Edge Function `admin-usuarios`
-- (criar login exige a service_role, que nao existe no banco nem no navegador).
create or replace function public.plataforma_criar_empresa(p_nome text, p_codigo text default null)
returns public.empresas
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_nome text := nullif(btrim(p_nome), '');
    v_codigo text := nullif(lower(btrim(p_codigo)), '');
    v_base text;
    v_n integer := 1;
    v_empresa public.empresas;
begin
    perform public.exigir_desenvolvedor();

    if v_nome is null then
        raise exception 'Informe o nome da empresa.' using errcode = 'invalid_parameter_value';
    end if;
    if exists (select 1 from public.empresas e where lower(btrim(e.nome)) = lower(v_nome)) then
        raise exception 'Já existe uma empresa com esse nome.' using errcode = 'unique_violation';
    end if;

    if v_codigo is null then
        -- Do nome: sem acento, minusculo, so letras, numeros e hifen.
        v_base := btrim(regexp_replace(
            lower(translate(v_nome,
                'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
                'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn')),
            '[^a-z0-9]+', '-', 'g'), '-');
        v_base := left(coalesce(nullif(v_base, ''), 'empresa'), 30);
        v_codigo := v_base;
        while exists (select 1 from public.empresas e where e.codigo = v_codigo) loop
            v_n := v_n + 1;
            v_codigo := v_base || '-' || v_n;
        end loop;
    elsif v_codigo !~ '^[a-z0-9][a-z0-9-]{0,39}$' then
        raise exception 'O código aceita só letras minúsculas, números e hífen.'
            using errcode = 'invalid_parameter_value';
    elsif exists (select 1 from public.empresas e where e.codigo = v_codigo) then
        raise exception 'Já existe uma empresa com esse código.' using errcode = 'unique_violation';
    end if;

    insert into public.empresas (nome, codigo) values (v_nome, v_codigo) returning * into v_empresa;

    insert into public.categorias (nome, tipo, empresa_id) values
        ('Combustível', 'DESPESA', v_empresa.id),
        ('Pedágio', 'DESPESA', v_empresa.id),
        ('Manutenção', 'DESPESA', v_empresa.id),
        ('Alimentação', 'DESPESA', v_empresa.id),
        ('Comissão de socorrista', 'DESPESA', v_empresa.id),
        ('Serviços de guincho', 'RECEITA', v_empresa.id);
    insert into public.contratantes (nome, empresa_id) values ('Porto Seguro', v_empresa.id);
    insert into public.configuracao_comissao (empresa_id) values (v_empresa.id);

    return v_empresa;
end;
$$;

-- Bloquear tira o acesso da empresa inteira na hora (toda policy passa a
-- responder falso), sem apagar nada. Reativar devolve tudo como estava.
create or replace function public.plataforma_definir_empresa_ativa(
    p_empresa uuid, p_ativa boolean, p_motivo text default null
)
returns public.empresas
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_empresa public.empresas;
begin
    perform public.exigir_desenvolvedor();

    update public.empresas
       set ativa = p_ativa,
           bloqueada_em = case when p_ativa then null else coalesce(bloqueada_em, now()) end,
           motivo_bloqueio = case when p_ativa then null else nullif(btrim(p_motivo), '') end
     where id = p_empresa
     returning * into v_empresa;

    if v_empresa.id is null then
        raise exception 'Empresa não encontrada.' using errcode = 'no_data_found';
    end if;
    return v_empresa;
end;
$$;

create or replace function public.plataforma_renomear_empresa(p_empresa uuid, p_nome text)
returns public.empresas
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_empresa public.empresas;
begin
    perform public.exigir_desenvolvedor();
    if nullif(btrim(p_nome), '') is null then
        raise exception 'Informe o nome da empresa.' using errcode = 'invalid_parameter_value';
    end if;

    update public.empresas set nome = btrim(p_nome) where id = p_empresa returning * into v_empresa;
    if v_empresa.id is null then
        raise exception 'Empresa não encontrada.' using errcode = 'no_data_found';
    end if;
    return v_empresa;
end;
$$;

do $$
declare
    f text;
begin
    foreach f in array array[
        'public.empresa_atual()', 'public.e_desenvolvedor()', 'public.exigir_desenvolvedor()',
        'public.plataforma_empresas()', 'public.plataforma_usuarios(uuid)',
        'public.plataforma_criar_empresa(text, text)',
        'public.plataforma_definir_empresa_ativa(uuid, boolean, text)',
        'public.plataforma_renomear_empresa(uuid, text)'
    ] loop
        execute format('revoke all on function %s from public, anon', f);
        execute format('grant execute on function %s to authenticated', f);
    end loop;
end $$;
-- A policy restritiva vale para todos os papeis, inclusive o visitante: ele
-- precisa conseguir avaliar a propria policy (que responde "sem empresa").
grant execute on function public.empresa_atual() to anon;
revoke all on function public.validar_mesma_empresa() from public, anon, authenticated;
revoke all on function public.importacao_do_caminho(text) from public, anon;
grant execute on function public.importacao_do_caminho(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 12. Entregar as funcoes privilegiadas ao papel que obedece a empresa
-- ---------------------------------------------------------------------------
-- Ficam de fora, com o dono original, so as funcoes que PRECISAM atravessar
-- empresas e foram escritas sabendo disso: as que respondem "quem sou eu" (so
-- olham a linha do proprio usuario), os gatilhos do Auth, e as da plataforma.

create or replace function public.funcoes_fora_do_executor()
returns text[]
language sql
immutable
set search_path = ''
as $$
    select array[
        'empresa_atual', 'perfil_atual', 'e_administrador', 'e_operador', 'motorista_atual',
        'e_desenvolvedor', 'situacao_do_acesso',
        'provisionar_perfil', 'sincronizar_email_perfil', 'concluir_troca_de_senha',
        'validar_mesma_empresa', 'avaliar', 'empresa_do_link', 'lancar_fixas_de_todas_as_empresas',
        'plataforma_empresas', 'plataforma_usuarios', 'plataforma_criar_empresa',
        'plataforma_definir_empresa_ativa', 'plataforma_renomear_empresa'
    ]
$$;

-- Toda migration que criar funcao SECURITY DEFINER termina chamando isto.
-- Quem esquecer e pego pela suite 99t_multiempresa.
create or replace function public.entregar_funcoes_ao_executor()
returns integer
language plpgsql
set search_path = ''
as $$
declare
    r record;
    v_entregues integer := 0;
begin
    for r in
        select p.oid::regprocedure as funcao
          from pg_proc p
         where p.pronamespace = 'public'::regnamespace
           and p.prosecdef
           and p.proowner <> 'funcoes_internas'::regrole
           and p.proname <> all (public.funcoes_fora_do_executor())
    loop
        execute format('alter function %s owner to funcoes_internas', r.funcao);
        v_entregues := v_entregues + 1;
    end loop;
    return v_entregues;
end;
$$;
revoke all on function public.entregar_funcoes_ao_executor() from public, anon, authenticated;
revoke all on function public.funcoes_fora_do_executor() from public, anon, authenticated;

select public.entregar_funcoes_ao_executor();
