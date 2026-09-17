-- OS sem socorrista vai para o "Auxiliar"; sem viatura, para a viatura "Auxiliar".
--
-- Pedido do dono, trazido por Kawa: a OS que vem da Porto sem nome de socorrista
-- entra no Auxiliar, e a viatura sem nome entra na viatura Auxiliar. O Auxiliar
-- ganha comissao como qualquer socorrista. A viatura Auxiliar e provisoria: a OP
-- nunca traz a sigla, e quando o painel diario trouxer, a sigla certa substitui
-- (o upsert ja faz coalesce(sigla nova, sigla guardada)).
--
-- Auxiliar tambem nao e "dono" para as sugestoes: QRA, codigo Porto, sugestao da
-- tela e escala do dia continuam podendo trocar o Auxiliar pelo socorrista certo.

create or replace function public.porto_auxiliar_motorista()
returns bigint language plpgsql security definer set search_path to '' as $$
declare v_id bigint;
begin
    select id into v_id from public.motoristas where upper(btrim(nome)) = 'AUXILIAR' order by id limit 1;
    if v_id is null then
        insert into public.motoristas (nome, ativo) values ('AUXILIAR', true) returning id into v_id;
    end if;
    return v_id;
end $$;

create or replace function public.porto_auxiliar_viatura()
returns text language plpgsql security definer set search_path to '' as $$
begin
    if not exists (select 1 from public.veiculos
                    where upper(btrim(sigla_porto)) = 'AUXILIAR' or upper(btrim(identificacao)) = 'AUXILIAR') then
        insert into public.veiculos (identificacao, sigla_porto) values ('AUXILIAR', 'AUXILIAR');
    end if;
    return 'AUXILIAR';
end $$;

revoke execute on function public.porto_auxiliar_motorista() from public, anon, authenticated;
revoke execute on function public.porto_auxiliar_viatura() from public, anon, authenticated;

do $$
declare v_def text; v_antes text;
begin
    select pg_get_functiondef('public.porto_confirmar_importacao'::regproc) into v_def;

    v_antes := 'v_viaturas jsonb;';
    if position(v_antes in v_def) = 0 then raise exception 'declaracoes nao encontradas'; end if;
    v_def := replace(v_def, v_antes, v_antes || E'\n    v_auxiliar bigint := public.porto_auxiliar_motorista();');

    v_antes := E'case when v_os_motorista is null\n                         then nullif(v_linha ->> ''motorista_sugerido_id'', '''')::bigint end';
    if position(v_antes in v_def) = 0 then raise exception 'sugestao nao encontrada'; end if;
    v_def := replace(v_def, v_antes, E'case when v_os_motorista is null or v_os_motorista = v_auxiliar\n                         then nullif(v_linha ->> ''motorista_sugerido_id'', '''')::bigint end');

    v_antes := E'case when v_os_motorista is null then\n                        (select max(outra.motorista_id)';
    if position(v_antes in v_def) = 0 then raise exception 'escala nao encontrada'; end if;
    v_def := replace(v_def, v_antes, E'case when v_os_motorista is null or v_os_motorista = v_auxiliar then\n                        (select max(outra.motorista_id)');

    v_antes := 'and outra.motorista_id is not null';
    if position(v_antes in v_def) = 0 then raise exception 'escala motorista nao encontrada'; end if;
    v_def := replace(v_def, v_antes, E'and outra.motorista_id is not null\n                            and outra.motorista_id <> v_auxiliar\n                            and upper(btrim(v_os_sigla)) <> ''AUXILIAR''');

    -- Depois do laco: o que continuou sem socorrista ou sem viatura vai para o Auxiliar.
    v_antes := 'v_viaturas := public.porto_cadastrar_viaturas(p_importacao_id);';
    if position(v_antes in v_def) = 0 then raise exception 'cadastro de viaturas nao encontrado'; end if;
    v_def := replace(v_def, v_antes,
        E'update public.ordens_servico_porto os\n       set motorista_id = v_auxiliar\n     where os.importacao_id = p_importacao_id and os.motorista_id is null\n       and os.status_operacional <> ''CANCELADO'';\n'
     || E'    if exists (select 1 from public.ordens_servico_porto os\n                where os.importacao_id = p_importacao_id and coalesce(btrim(os.sigla_viatura), '''') = '''') then\n'
     || E'        update public.ordens_servico_porto os\n           set sigla_viatura = public.porto_auxiliar_viatura()\n         where os.importacao_id = p_importacao_id and coalesce(btrim(os.sigla_viatura), '''') = '''';\n    end if;\n'
     || E'    update public.receitas r set motorista_id = os.motorista_id\n      from public.ordens_servico_porto os\n     where os.importacao_id = p_importacao_id and r.ordem_servico_porto_id = os.id\n       and r.motorista_id is distinct from os.motorista_id;\n'
     || E'    update public.contas_receber c set motorista_id = os.motorista_id\n      from public.ordens_servico_porto os\n     where os.importacao_id = p_importacao_id and c.ordem_servico_porto_id = os.id\n       and c.motorista_id is distinct from os.motorista_id;\n    '
     || v_antes);

    execute v_def;
end $$;
