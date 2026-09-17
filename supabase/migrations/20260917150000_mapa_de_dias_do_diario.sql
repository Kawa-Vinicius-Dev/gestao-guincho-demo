-- Diario Operacional x OP — etapa 2: mapa dos dias importados.
--
-- Saber "que dias ja foram colados" nao da para deduzir das OS: dia sem servico
-- nenhum e igual a dia esquecido, e a OS importada pelo Diario perde o vinculo
-- com a importacao quando a OP chega depois. Entao o dia coberto e registrado
-- na hora da importacao do painel.

create table if not exists public.dias_diario_porto (
    dia date primary key,
    importacao_id bigint references public.importacoes_porto(id) on delete set null,
    registrado_em timestamptz not null default now()
);

alter table public.dias_diario_porto enable row level security;

do $$ begin
    if not exists (select 1 from pg_policies where schemaname = 'public'
                     and tablename = 'dias_diario_porto' and policyname = 'dias_diario_porto_admin') then
        create policy dias_diario_porto_admin on public.dias_diario_porto
            for all using ((select public.e_administrador())) with check ((select public.e_administrador()));
    end if;
end $$;

grant select, insert, update, delete on public.dias_diario_porto to authenticated;

-- A importacao do painel marca os dias que ela cobriu.
do $$
declare v_def text; v_antes text;
begin
    select pg_get_functiondef('public.porto_confirmar_importacao'::regproc) into v_def;
    v_antes := 'v_viaturas := public.porto_cadastrar_viaturas(p_importacao_id);';
    if position(v_antes in v_def) = 0 then raise exception 'confirmar_importacao: ancora das viaturas nao encontrada'; end if;
    execute replace(v_def, v_antes,
        'if v_imp.tipo_relatorio = ''PAINEL_DIARIO'' then
        insert into public.dias_diario_porto (dia, importacao_id, registrado_em)
        select distinct (l->>''data_atendimento'')::date, p_importacao_id, now()
          from jsonb_array_elements(p_linhas) l
         where nullif(l->>''data_atendimento'', '''') is not null
        on conflict (dia) do update
            set importacao_id = excluded.importacao_id, registrado_em = excluded.registrado_em;
    end if;
    ' || v_antes);
end $$;

-- Mapa do periodo: por dia, se o Diario ja passou por ali e o que existe de OS.
create or replace function public.porto_diario_mapa(p_inicio date, p_fim date)
returns table (dia date, importado boolean, importado_em timestamptz, os integer, sem_valor integer)
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
    perform public.exigir_administrador();
    return query
    with por_dia as (
        select os.data_atendimento as dia,
               count(*)::int as os,
               count(*) filter (where s.sem_valor)::int as sem_valor
          from public.ordens_servico_porto os
          join public.porto_os_situacao() s on s.os_id = os.id
         where os.data_atendimento between p_inicio and p_fim
         group by os.data_atendimento
    )
    select d::date,
           m.dia is not null,
           m.registrado_em,
           coalesce(c.os, 0),
           coalesce(c.sem_valor, 0)
      from generate_series(p_inicio, p_fim, interval '1 day') d
      left join public.dias_diario_porto m on m.dia = d::date
      left join por_dia c on c.dia = d::date
     order by d;
end;
$$;
revoke execute on function public.porto_diario_mapa(date, date) from public, anon;
grant execute on function public.porto_diario_mapa(date, date) to authenticated;
