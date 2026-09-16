-- Codigos da Porto no cadastro do socorrista.
--
-- Kawa: "a ideia e fazer tudo com a OP". Na OP, a coluna QRA as vezes traz um
-- codigo interno da Porto no lugar do QRA (003TT0000176zMBYAY para o Anderson,
-- 003TT00001QI54zYAD para o Djalma...). Esse codigo nao casava com o cadastro, e
-- a OS caia para escolha manual a cada importacao. O socorrista passa a guardar
-- os codigos que a Porto usa para ele, e o vinculo automatico aceita o QRA ou
-- qualquer um desses codigos.
--
-- Codigo repetido em dois socorristas nao vincula ninguem: errar o dono da
-- comissao em silencio e pior do que perguntar.

alter table public.motoristas
    add column if not exists codigos_porto text[] not null default '{}';
comment on column public.motoristas.codigos_porto is
    'Outros codigos que a Porto usa no lugar do QRA para este socorrista.';

create or replace function public.motorista_por_qra(p_qra text)
returns bigint
language sql
stable
set search_path = ''
as $$
    select case when count(*) = 1 then max(m.id) end
    from public.motoristas m
    where p_qra is not null and btrim(p_qra) <> ''
      and (upper(btrim(m.qra)) = upper(btrim(p_qra))
           or upper(btrim(p_qra)) in (select upper(btrim(c)) from unnest(m.codigos_porto) c))
$$;
revoke execute on function public.motorista_por_qra(text) from public, anon;
grant execute on function public.motorista_por_qra(text) to authenticated;

do $$
declare v_def text; v_antes text;
begin
    select pg_get_functiondef('public.porto_confirmar_importacao'::regproc) into v_def;
    v_antes := '                    (select m.id from public.motoristas m
                      where v_os_qra is not null and m.qra is not null
                        and upper(btrim(m.qra)) = upper(btrim(v_os_qra)) limit 1),';
    if position(v_antes in v_def) = 0 then raise exception 'busca por QRA nao encontrada'; end if;
    execute replace(v_def, v_antes, '                    public.motorista_por_qra(v_os_qra),');
end $$;
