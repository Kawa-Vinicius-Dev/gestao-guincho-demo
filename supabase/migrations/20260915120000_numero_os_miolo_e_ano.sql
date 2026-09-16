-- A mesma OS chega escrita de dois jeitos.
--
--   painel diario   5673329/26
--   relatorio da OP 01/3195073-26
--
-- Sao o mesmo servico: o miolo e o numero, o sufixo e o ano, e o prefixo de um
-- ou dois digitos ("01/", "04/", "05/") a Porto poe so no relatorio da OP. A
-- regra antiga tirava os simbolos e comparava os digitos crus — "0131950732"
-- nunca casava com "319507326" —, entao a OS do diario e a da OP viravam duas
-- linhas e o faturamento aparecia dobrado.
--
-- O prefixo e ignorado enquanto nao se sabe o que ele significa. Se um dia dois
-- servicos diferentes tiverem o mesmo miolo, eles colidem no indice unico e a
-- importacao recusa — melhor do que somar dois servicos como se fossem um.
--
-- A mesma regra vive em `normalizarNumero`, no frontend, que compara antes de
-- enviar. As duas precisam continuar identicas.
create or replace function public.numero_os_normalizado(p_numero text)
returns text
language sql
immutable
set search_path = ''
as $$
    select case
        when btrim(coalesce(p_numero, '')) = '' then ''
        when btrim(p_numero) ~ '^(\d{1,2}[/-])?\d{4,}[-/]\d{2}$'
            then regexp_replace(btrim(p_numero), '^(\d{1,2}[/-])?(\d{4,})[-/](\d{2})$', '\2\3')
        else regexp_replace(btrim(p_numero), '[^0-9]', '', 'g')
    end
$$;

comment on function public.numero_os_normalizado(text) is
    'Chave de comparacao da OS: miolo + ano, sem o prefixo que so a OP traz.';

revoke execute on function public.numero_os_normalizado(text) from public, anon;
grant execute on function public.numero_os_normalizado(text) to authenticated;

-- Troca a normalizacao dentro do pipeline de importacao sem repetir aqui as
-- quase trezentas linhas de `porto_confirmar_importacao`: le a definicao atual,
-- substitui a expressao antiga pela funcao nova e recria. Duplicar a funcao
-- inteira num segundo arquivo criaria duas versoes para manter em sincronia.
do $$
declare v_def text;
begin
    select pg_get_functiondef(p.oid) into v_def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'porto_confirmar_importacao';

    if v_def is null then
        raise exception 'porto_confirmar_importacao nao encontrada';
    end if;
    if position('regexp_replace(v_numero' in v_def) = 0 then
        raise exception 'expressao de normalizacao nao encontrada na funcao';
    end if;

    v_def := replace(
        v_def,
        'regexp_replace(v_numero, ''[^0-9]'', '''', ''g'')',
        'public.numero_os_normalizado(v_numero)');
    execute v_def;
end $$;
