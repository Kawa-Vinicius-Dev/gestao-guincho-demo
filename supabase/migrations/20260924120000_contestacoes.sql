-- Contestacao de glosa e pagamento a menos da Porto.
--
-- Kawa, 24/09/2026: o sistema ja apontava OS sem valor e divergente, mas o
-- acompanhamento parava ali — o dinheiro que a Porto deixou de pagar se perdia
-- por esquecimento. Agora cada caso vira um registro com situacao, prazo e valor
-- recuperado.
--
-- Decisoes dele:
--  * valor esperado vem de uma TABELA DE PRECOS por especialidade, cadastrada uma
--    vez (sem tabela para a especialidade, vale o valor informado a mao na OS);
--  * OS feita que nao veio na OP vira glosa depois de 1 OP seguinte: nao veio na
--    OP da quinzena dela nem na da quinzena seguinte. A Porto as vezes paga
--    atrasado na OP seguinte, e cobrar antes disso seria alarme falso.
--
-- A deteccao roda quando o administrador abre a tela de Contestacoes: cria os
-- casos novos, fecha sozinho o que a Porto acabou pagando e atualiza o valor
-- esperado dos casos que ninguem mexeu ainda.
--
-- Idempotente: pode rodar de novo no SQL Editor sem efeito colateral.

-- ---------------------------------------------------------------- tabela de precos
create table if not exists public.porto_tabela_precos (
    id bigint generated always as identity primary key,
    especialidade text not null,
    valor numeric(12, 2) not null,
    atualizado_em timestamptz not null default now(),
    constraint porto_tabela_precos_valor_positivo check (valor >= 0),
    constraint porto_tabela_precos_especialidade_nao_vazia check (length(btrim(especialidade)) > 0)
);
create unique index if not exists porto_tabela_precos_uma_por_especialidade
    on public.porto_tabela_precos (upper(btrim(especialidade)));
comment on table public.porto_tabela_precos is
    'Quanto a Porto paga por especialidade. E o valor esperado que a contestacao compara com o pago.';

alter table public.porto_tabela_precos enable row level security;
grant select, insert, update, delete on public.porto_tabela_precos to authenticated;
drop policy if exists porto_tabela_precos_admin on public.porto_tabela_precos;
create policy porto_tabela_precos_admin on public.porto_tabela_precos
    for all to authenticated
    using ((select public.e_administrador())) with check ((select public.e_administrador()));

-- ---------------------------------------------------------------- casos
create table if not exists public.porto_contestacoes (
    id bigint generated always as identity primary key,
    os_id bigint not null references public.ordens_servico_porto (id) on delete cascade,
    -- NAO_PAGA: a OS nao veio na OP dela nem na seguinte.
    -- PAGA_A_MENOS: veio numa OP com valor abaixo do esperado.
    tipo text not null,
    valor_esperado numeric(12, 2),
    valor_pago numeric(12, 2) not null default 0,
    situacao text not null default 'A_CONTESTAR',
    prazo date,
    contestada_em date,
    protocolo text,
    observacao text,
    resolvida_em date,
    valor_recuperado numeric(12, 2),
    criado_em timestamptz not null default now(),
    atualizado_em timestamptz not null default now(),
    constraint porto_contestacoes_tipo_valido check (tipo in ('NAO_PAGA', 'PAGA_A_MENOS')),
    constraint porto_contestacoes_situacao_valida
        check (situacao in ('A_CONTESTAR', 'CONTESTADA', 'ACEITA', 'PERDIDA')),
    constraint porto_contestacoes_um_por_tipo unique (os_id, tipo),
    constraint porto_contestacoes_recuperado_nao_negativo check (valor_recuperado is null or valor_recuperado >= 0)
);
create index if not exists porto_contestacoes_por_situacao on public.porto_contestacoes (situacao, prazo);
comment on table public.porto_contestacoes is
    'Cada OS que a Porto nao pagou ou pagou a menos, e o que foi feito para recuperar.';

alter table public.porto_contestacoes enable row level security;
grant select, update on public.porto_contestacoes to authenticated;
drop policy if exists porto_contestacoes_admin_leitura on public.porto_contestacoes;
create policy porto_contestacoes_admin_leitura on public.porto_contestacoes
    for select to authenticated using ((select public.e_administrador()));
drop policy if exists porto_contestacoes_admin_atualiza on public.porto_contestacoes;
create policy porto_contestacoes_admin_atualiza on public.porto_contestacoes
    for update to authenticated
    using ((select public.e_administrador())) with check ((select public.e_administrador()));

-- Situacao final grava a data; voltar para aberta limpa.
create or replace function public.porto_contestacao_carimba()
returns trigger language plpgsql set search_path = '' as $$
begin
    new.atualizado_em := now();
    if new.situacao in ('ACEITA', 'PERDIDA') then
        new.resolvida_em := coalesce(new.resolvida_em, current_date);
        if new.situacao = 'PERDIDA' then new.valor_recuperado := 0; end if;
    else
        new.resolvida_em := null;
        new.valor_recuperado := null;
    end if;
    if new.situacao = 'CONTESTADA' then
        new.contestada_em := coalesce(new.contestada_em, current_date);
    end if;
    return new;
end;
$$;
drop trigger if exists porto_contestacoes_carimba on public.porto_contestacoes;
create trigger porto_contestacoes_carimba
    before insert or update on public.porto_contestacoes
    for each row execute function public.porto_contestacao_carimba();

-- ---------------------------------------------------------------- valor esperado
create or replace function public.porto_valor_esperado(p_especialidade text, p_valor_manual numeric)
returns numeric language sql stable security definer set search_path = '' as $$
    select coalesce(
        (select t.valor from public.porto_tabela_precos t
          where upper(btrim(t.especialidade)) = upper(btrim(coalesce(p_especialidade, '')))),
        p_valor_manual)
$$;

-- ---------------------------------------------------------------- deteccao
-- Prazo padrao para contestar, contado da deteccao. Editavel caso a caso.
create or replace function public.porto_detectar_contestacoes(p_hoje date default current_date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_novos integer := 0;
    v_n integer;
    -- So o que ainda da para cobrar: atendimentos dos ultimos 120 dias.
    v_desde date := p_hoje - 120;
    v_prazo date := p_hoje + 30;
begin
    perform public.exigir_administrador();

    -- 1. A Porto acabou pagando: o caso fecha sozinho como aceito.
    update public.porto_contestacoes c
       set situacao = 'ACEITA',
           valor_pago = os.valor_total,
           valor_recuperado = greatest(os.valor_total - c.valor_pago, 0),
           observacao = concat_ws(' · ', nullif(c.observacao, ''), 'Paga na OP ' || op.numero)
      from public.ordens_servico_porto os
      join public.ordens_pagamento_porto op on op.id = os.ordem_pagamento_id
     where c.os_id = os.id and c.tipo = 'NAO_PAGA'
       and c.situacao in ('A_CONTESTAR', 'CONTESTADA');

    -- 2. Pagamento a menos que deixou de ser (tabela corrigida): some se ninguem mexeu.
    delete from public.porto_contestacoes c
     using public.ordens_servico_porto os
     where c.os_id = os.id and c.tipo = 'PAGA_A_MENOS' and c.situacao = 'A_CONTESTAR'
       and (os.ordem_pagamento_id is null
            or coalesce(public.porto_valor_esperado(os.especialidade, os.valor_manual), 0) - os.valor_total < 0.01);

    -- 3. Casos que ninguem mexeu acompanham a tabela de precos.
    update public.porto_contestacoes c
       set valor_esperado = public.porto_valor_esperado(os.especialidade, os.valor_manual)
      from public.ordens_servico_porto os
     where c.os_id = os.id and c.situacao = 'A_CONTESTAR'
       and c.valor_esperado is distinct from public.porto_valor_esperado(os.especialidade, os.valor_manual);

    -- 4. OS nao paga: a quinzena dela teve OP, a seguinte tambem, e ela nao veio.
    with comp as (
        select row_number() over (order by fim) as n, inicio, fim, tem_op
          from public.porto_competencias()
    ), candidatas as (
        select os.id, os.especialidade, os.valor_manual,
               (select c.n from comp c where c.fim >= os.data_atendimento order by c.fim limit 1) as n
          from public.ordens_servico_porto os
         where os.ordem_pagamento_id is null
           and os.status_operacional::text <> 'CANCELADO'
           and os.data_atendimento >= v_desde
    )
    insert into public.porto_contestacoes (os_id, tipo, valor_esperado, valor_pago, prazo)
    select k.id, 'NAO_PAGA', public.porto_valor_esperado(k.especialidade, k.valor_manual), 0, v_prazo
      from candidatas k
      join comp propria on propria.n = k.n and propria.tem_op
      join comp seguinte on seguinte.n = k.n + 1 and seguinte.tem_op
    on conflict (os_id, tipo) do nothing;
    get diagnostics v_n = row_count;
    v_novos := v_novos + v_n;

    -- 5. OS paga a menos que o esperado.
    insert into public.porto_contestacoes (os_id, tipo, valor_esperado, valor_pago, prazo)
    select os.id, 'PAGA_A_MENOS', e.esperado, os.valor_total, v_prazo
      from public.ordens_servico_porto os
      cross join lateral (select public.porto_valor_esperado(os.especialidade, os.valor_manual) as esperado) e
     where os.ordem_pagamento_id is not null
       and os.status_operacional::text <> 'CANCELADO'
       and os.data_atendimento >= v_desde
       and e.esperado is not null
       and e.esperado - os.valor_total >= 0.01
    on conflict (os_id, tipo) do nothing;
    get diagnostics v_n = row_count;
    v_novos := v_novos + v_n;

    return v_novos;
end;
$$;
revoke execute on function public.porto_detectar_contestacoes(date) from public, anon;
grant execute on function public.porto_detectar_contestacoes(date) to authenticated;

-- Para a tabela de precos: as especialidades que a Porto ja mandou, com quantas OS
-- e o valor mais comum pago, para o administrador preencher sem adivinhar.
create or replace function public.porto_especialidades_vistas()
returns table(especialidade text, servicos bigint, valor_mais_comum numeric, valor_tabela numeric)
language plpgsql stable security definer set search_path = ''
as $$
begin
    perform public.exigir_administrador();
    return query
    with vistas as (
        select upper(btrim(os.especialidade)) as nome,
               count(*) as servicos,
               mode() within group (order by os.valor_total)
                   filter (where os.ordem_pagamento_id is not null and os.valor_total > 0) as comum
          from public.ordens_servico_porto os
         where coalesce(btrim(os.especialidade), '') <> ''
         group by upper(btrim(os.especialidade))
    )
    select v.nome, v.servicos, v.comum, t.valor
      from vistas v
      left join public.porto_tabela_precos t on upper(btrim(t.especialidade)) = v.nome
     order by v.servicos desc;
end;
$$;
revoke execute on function public.porto_especialidades_vistas() from public, anon;
grant execute on function public.porto_especialidades_vistas() to authenticated;

-- Grava (ou apaga, com valor nulo) o preco de uma especialidade. Casa pelo nome
-- normalizado, entao "Remocao " e "REMOCAO" sao a mesma linha.
create or replace function public.porto_salvar_preco(p_especialidade text, p_valor numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    perform public.exigir_administrador();
    if length(btrim(coalesce(p_especialidade, ''))) = 0 then
        raise exception 'Informe a especialidade.' using errcode = 'invalid_parameter_value';
    end if;
    if p_valor is null then
        delete from public.porto_tabela_precos
         where upper(btrim(especialidade)) = upper(btrim(p_especialidade));
        return;
    end if;
    if p_valor < 0 then
        raise exception 'O preço não pode ser negativo.' using errcode = 'invalid_parameter_value';
    end if;
    update public.porto_tabela_precos set valor = round(p_valor, 2), atualizado_em = now()
     where upper(btrim(especialidade)) = upper(btrim(p_especialidade));
    if not found then
        insert into public.porto_tabela_precos (especialidade, valor)
        values (upper(btrim(p_especialidade)), round(p_valor, 2));
    end if;
end;
$$;
revoke execute on function public.porto_salvar_preco(text, numeric) from public, anon;
grant execute on function public.porto_salvar_preco(text, numeric) to authenticated;
