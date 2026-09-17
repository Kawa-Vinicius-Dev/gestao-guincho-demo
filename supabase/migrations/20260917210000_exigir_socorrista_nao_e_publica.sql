-- `exigir_socorrista` nasceu sem revoke e ficou chamavel pelo `anon`, isto e,
-- por quem nem entrou no sistema. Ela nao vaza dado — sem sessao ela so levanta
-- excecao —, mas uma funcao SECURITY DEFINER exposta na API publica e superficie
-- que ninguem pediu, e o linter do Supabase aponta com razao.
--
-- Ela e auxiliar das outras RPCs, que rodam como definer e a chamam por dentro:
-- o revoke nao tira nada de quem usa o sistema.

revoke execute on function public.exigir_socorrista() from public, anon;
