-- pagar_comissao procurava "comissao de socorrista" sem acento e nao achava a
-- categoria "Comissao de socorrista" (com til), criada pela sincronizacao: tentava
-- criar outra igual e batia na unicidade. A funcao e do fluxo antigo, que a tela
-- nao usa mais (a comissao entra sozinha), mas continua exposta e testada.
--
-- Idempotente: pode rodar de novo no SQL Editor sem efeito colateral.
do $$
declare
    v_def text := pg_get_functiondef('public.pagar_comissao(bigint,bigint,date,text,text)'::regprocedure);
    v_antes constant text := 'where lower(btrim(nome)) = ''comissao de socorrista'' and tipo = ''DESPESA''';
    -- Sem acento na comparacao: casa "Comissao" e "Comissao" com til, venha o
    -- til em que bytes vier.
    v_depois constant text := 'where lower(btrim(nome)) like ''comiss%o de socorrista'' and tipo = ''DESPESA''';
begin
    if position(v_depois in v_def) > 0 then return; end if;
    if position(v_antes in v_def) = 0 then
        raise exception 'pagar_comissao nao tem o trecho esperado; revisar esta migration';
    end if;
    execute replace(v_def, v_antes, v_depois);
end $$;
