-- Viatura nova entra sozinha pela importacao.
--
-- Kawa quer que o cadastro de viaturas saia do diario da Porto: toda sigla que
-- chega numa OS (L168, K85...) e que ainda nao esta cadastrada vira uma viatura,
-- sem pergunta. O diario nao traz a placa, entao a placa deixa de ser
-- obrigatoria: a viatura nasce so com a sigla e a placa fica pendente ate
-- alguem completar em Veiculos.

alter table public.veiculos alter column placa drop not null;

-- p_importacao_id nulo olha todas as OS (usado uma vez, logo abaixo).
create or replace function public.porto_cadastrar_viaturas(p_importacao_id bigint default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
    v_novas jsonb;
begin
    -- Viatura cadastrada a mao pelo identificador, mas sem a sigla da Porto:
    -- ganha a sigla em vez de virar uma segunda viatura.
    update public.veiculos v
       set sigla_porto = upper(btrim(v.identificacao))
     where v.sigla_porto is null
       and exists (select 1 from public.ordens_servico_porto os
                    where (p_importacao_id is null or os.importacao_id = p_importacao_id)
                      and upper(btrim(os.sigla_viatura)) = upper(btrim(v.identificacao)))
       and not exists (select 1 from public.veiculos outro
                        where upper(btrim(outro.sigla_porto)) = upper(btrim(v.identificacao)));

    with siglas as (
        select distinct upper(btrim(os.sigla_viatura)) as sigla
          from public.ordens_servico_porto os
         where (p_importacao_id is null or os.importacao_id = p_importacao_id)
           and coalesce(btrim(os.sigla_viatura), '') <> ''
    ), novas as (
        insert into public.veiculos (identificacao, sigla_porto)
        select s.sigla, s.sigla from siglas s
         where not exists (select 1 from public.veiculos v
                            where upper(btrim(v.sigla_porto)) = s.sigla
                               or upper(btrim(v.identificacao)) = s.sigla)
        returning identificacao
    )
    select coalesce(jsonb_agg(identificacao order by identificacao), '[]'::jsonb) into v_novas from novas;
    return v_novas;
end;
$$;

revoke execute on function public.porto_cadastrar_viaturas(bigint) from public, anon, authenticated;

do $$
declare v_def text; v_antes text;
begin
    select pg_get_functiondef('public.porto_confirmar_importacao'::regproc) into v_def;

    v_antes := 'v_vistos text[] := ''{}'';';
    if position(v_antes in v_def) = 0 then raise exception 'declaracoes nao encontradas'; end if;
    v_def := replace(v_def, v_antes, v_antes || E'\n    v_viaturas jsonb;');

    v_antes := 'perform public.porto_sincronizar_comissoes();';
    if position(v_antes in v_def) = 0 then raise exception 'sincronizacao nao encontrada'; end if;
    v_def := replace(v_def, v_antes, 'v_viaturas := public.porto_cadastrar_viaturas(p_importacao_id);' || E'\n    ' || v_antes);

    v_antes := '''receitasCriadas'', v_receitas,';
    if position(v_antes in v_def) = 0 then raise exception 'retorno nao encontrado'; end if;
    execute replace(v_def, v_antes, v_antes || E'\n        ''viaturasNovas'', v_viaturas,');
end $$;

-- As siglas das OS que ja estao no banco tambem viram viatura.
select public.porto_cadastrar_viaturas(null);
