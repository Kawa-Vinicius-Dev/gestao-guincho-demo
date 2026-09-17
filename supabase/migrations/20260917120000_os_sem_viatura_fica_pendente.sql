-- OS sem viatura fica sem viatura (pendente), e nao na viatura Auxiliar.
-- Kawa: o Auxiliar e so para OS que vem sem o nome do socorrista; "se vier sem
-- viatura ela continua sem viatura, pendente de viatura".
do $$
declare v_def text; v_antes text;
begin
    select pg_get_functiondef('public.porto_confirmar_importacao'::regproc) into v_def;
    v_antes := E'    if exists (select 1 from public.ordens_servico_porto os\n                where os.importacao_id = p_importacao_id and coalesce(btrim(os.sigla_viatura), '''') = '''') then\n        update public.ordens_servico_porto os\n           set sigla_viatura = public.porto_auxiliar_viatura()\n         where os.importacao_id = p_importacao_id and coalesce(btrim(os.sigla_viatura), '''') = '''';\n    end if;\n';
    if position(v_antes in v_def) = 0 then raise exception 'bloco da viatura auxiliar nao encontrado'; end if;
    execute replace(v_def, v_antes, '');
end $$;

update public.ordens_servico_porto set sigla_viatura = null where upper(btrim(sigla_viatura)) = 'AUXILIAR';
delete from public.veiculos where upper(btrim(identificacao)) = 'AUXILIAR' and upper(btrim(coalesce(sigla_porto, 'AUXILIAR'))) = 'AUXILIAR';
drop function if exists public.porto_auxiliar_viatura();
