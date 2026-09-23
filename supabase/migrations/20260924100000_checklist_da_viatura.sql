-- Checklist da viatura na abertura do turno.
--
-- Kawa, 23/09/2026: o tio pediu que, ao comecar o turno, o socorrista faca um
-- checklist da viatura tirando foto: os 4 lados, os 4 pneus e algum possivel
-- dano (o painel ja e a foto do odometro). "Nao quero que o banco fique pesado...
-- nao preciso dessas fotos, eu so preciso ver para ver se esta tudo ok."
--
-- Por isso:
--  * as fotos vao para o Storage (bucket privado `comprovantes`, pasta do turno,
--    que as policies de turnos/<id>/ ja cobrem), comprimidas no celular; no
--    banco fica so o caminho de cada uma, em `turnos.checklist`;
--  * sao apagadas quando o administrador aprova o turno, ou 7 dias depois do
--    turno, o que vier primeiro (decisao de Kawa);
--  * o checklist e obrigatorio: sem ele o turno nao fecha. Turnos que ja estavam
--    abertos antes desta migration fecham sem ele.
--
-- Idempotente: pode rodar de novo no SQL Editor sem efeito colateral.

alter table public.turnos
    add column if not exists checklist jsonb,
    add column if not exists checklist_apagado_em timestamptz,
    add column if not exists exige_checklist boolean not null default false;
-- Os que ja existem ficaram com false; daqui em diante todo turno exige.
alter table public.turnos alter column exige_checklist set default true;

comment on column public.turnos.checklist is
    'Fotos da viatura na saida: {"fotos": {frente, traseira, esquerda, direita, pneu_de, pneu_dd, pneu_te, pneu_td}, "danos": [{caminho, descricao}]}. So caminhos no Storage.';
comment on column public.turnos.checklist_apagado_em is
    'Quando as fotos do checklist sairam do Storage (aprovacao ou 7 dias).';

-- As 8 fotos que todo checklist tem.
create or replace function public.fotos_do_checklist()
returns text[] language sql immutable set search_path = '' as $$
    select array['frente', 'traseira', 'esquerda', 'direita', 'pneu_de', 'pneu_dd', 'pneu_te', 'pneu_td']
$$;

-- O socorrista grava o checklist do proprio turno aberto.
create or replace function public.registrar_checklist(
    p_turno_id bigint, p_fotos jsonb, p_danos jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_motorista bigint := public.exigir_socorrista();
    v_pasta text := 'turnos/' || p_turno_id || '/';
    v_chave text;
    v_dano jsonb;
begin
    perform 1 from public.turnos
     where id = p_turno_id and motorista_id = v_motorista and situacao = 'ABERTO';
    if not found then
        raise exception 'Turno nao encontrado ou ja fechado.' using errcode = 'invalid_parameter_value';
    end if;

    foreach v_chave in array public.fotos_do_checklist() loop
        if coalesce(p_fotos ->> v_chave, '') not like v_pasta || '%' then
            raise exception 'Falta a foto "%" do checklist.', v_chave using errcode = 'invalid_parameter_value';
        end if;
    end loop;

    if jsonb_typeof(coalesce(p_danos, '[]'::jsonb)) <> 'array' then
        raise exception 'Danos invalidos.' using errcode = 'invalid_parameter_value';
    end if;
    for v_dano in select * from jsonb_array_elements(coalesce(p_danos, '[]'::jsonb)) loop
        if coalesce(v_dano ->> 'caminho', '') not like v_pasta || '%' then
            raise exception 'Foto de dano invalida.' using errcode = 'invalid_parameter_value';
        end if;
        if length(btrim(coalesce(v_dano ->> 'descricao', ''))) = 0 then
            raise exception 'Diga onde e o dano.' using errcode = 'invalid_parameter_value';
        end if;
    end loop;

    update public.turnos
       set checklist = jsonb_build_object(
               'fotos', (select jsonb_object_agg(k, p_fotos ->> k) from unnest(public.fotos_do_checklist()) k),
               'danos', coalesce(p_danos, '[]'::jsonb)),
           checklist_apagado_em = null
     where id = p_turno_id;
end;
$$;
revoke execute on function public.registrar_checklist(bigint, jsonb, jsonb) from public, anon;
grant execute on function public.registrar_checklist(bigint, jsonb, jsonb) to authenticated;

-- Fechar exige o checklist (so nos turnos abertos depois desta migration).
create or replace function public.fechar_turno(
    p_turno_id bigint,
    p_hodometro numeric,
    p_foto text,
    p_observacoes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_motorista bigint := public.exigir_socorrista();
    v_inicial numeric;
    v_foto_saida text;
    v_falta_checklist boolean;
begin
    select t.hodometro_inicial, t.foto_abertura, t.exige_checklist and t.checklist is null
      into v_inicial, v_foto_saida, v_falta_checklist
    from public.turnos t
    where t.id = p_turno_id
      and t.motorista_id = v_motorista
      and t.situacao in ('ABERTO', 'DEVOLVIDO');

    if not found then
        raise exception 'Turno nao encontrado.' using errcode = 'invalid_parameter_value';
    end if;

    if v_foto_saida is null then
        raise exception 'Envie a foto do painel da saida antes de fechar o turno.'
            using errcode = 'invalid_parameter_value';
    end if;

    if v_falta_checklist then
        raise exception 'Envie as fotos do checklist da viatura antes de fechar o turno.'
            using errcode = 'invalid_parameter_value';
    end if;

    if p_hodometro is null then
        raise exception 'Informe o odometro de fechamento.'
            using errcode = 'invalid_parameter_value';
    end if;

    if p_hodometro < v_inicial then
        raise exception 'O odometro de fechamento (%) e menor que o de abertura (%).'
            , p_hodometro, v_inicial using errcode = 'invalid_parameter_value';
    end if;

    if length(btrim(coalesce(p_foto, ''))) = 0 then
        raise exception 'A foto do odometro e obrigatoria para fechar o turno.'
            using errcode = 'invalid_parameter_value';
    end if;

    update public.turnos
       set situacao = 'AGUARDANDO_APROVACAO',
           fechado_em = now(),
           hodometro_final = p_hodometro,
           foto_fechamento = p_foto,
           devolucao_motivo = null,
           observacoes = coalesce(nullif(btrim(coalesce(p_observacoes, '')), ''), observacoes)
     where id = p_turno_id;
end;
$$;
revoke execute on function public.fechar_turno(bigint, numeric, text, text) from public, anon;
grant execute on function public.fechar_turno(bigint, numeric, text, text) to authenticated;

-- Fotos de checklist que ja podem sair do Storage: turno aprovado, ou turno com
-- mais de 7 dias. O Storage nao deixa apagar arquivo pelo SQL, entao o banco diz
-- quais sao, a tela do administrador apaga e depois marca.
create or replace function public.checklists_para_apagar(p_hoje date default current_date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
    perform public.exigir_administrador();
    return coalesce((
        select jsonb_agg(jsonb_build_object(
            'id', t.id,
            'caminhos', (
                select coalesce(jsonb_agg(c), '[]'::jsonb) from (
                    select value as c from jsonb_each_text(t.checklist -> 'fotos')
                    union all
                    select d ->> 'caminho' from jsonb_array_elements(coalesce(t.checklist -> 'danos', '[]'::jsonb)) d
                ) todas where c is not null)))
        from public.turnos t
        where t.checklist is not null
          and t.checklist_apagado_em is null
          and (t.situacao = 'APROVADO' or t.data_turno < p_hoje - 7)
    ), '[]'::jsonb);
end;
$$;
revoke execute on function public.checklists_para_apagar(date) from public, anon;
grant execute on function public.checklists_para_apagar(date) to authenticated;

create or replace function public.marcar_checklists_apagados(p_ids bigint[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    perform public.exigir_administrador();
    update public.turnos set checklist_apagado_em = now()
     where id = any(p_ids) and checklist is not null and checklist_apagado_em is null;
end;
$$;
revoke execute on function public.marcar_checklists_apagados(bigint[]) from public, anon;
grant execute on function public.marcar_checklists_apagados(bigint[]) to authenticated;
