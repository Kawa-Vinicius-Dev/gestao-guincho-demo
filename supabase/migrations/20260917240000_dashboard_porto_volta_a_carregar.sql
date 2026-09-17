-- Duas coisas que so aparecem com um usuario de verdade logado.
--
-- 1. O DASHBOARD PORTO NAO CARREGAVA PARA NINGUEM.
--
-- `porto_dashboard_alto_nivel` e a RPC que monta a tela inteira, e na etapa 5 ela
-- passou a ler `porto_os_situacao()` para agrupar por competencia. So que ela e
-- SECURITY INVOKER: roda com os poderes de quem chamou. E `porto_os_situacao`,
-- que e uma funcao interna, nunca teve EXECUTE para `authenticated`. Resultado,
-- para qualquer pessoa logada:
--
--     permission denied for function porto_os_situacao
--
-- A tela ficava no erro de carregamento. Nao apareceu em teste porque os testes
-- do frontend respondem a RPC com um exemplo pronto, sem passar pelo banco, e a
-- verificacao visual roda na bancada, que tambem nao chama o Postgres.
--
-- A correcao e tornar a funcao SECURITY DEFINER, como todas as outras RPCs do
-- modulo. Ela ja comeca com `exigir_administrador()`, entao nao abre nada: o
-- controle continua sendo o perfil de quem chama, e nao o acaso de quais
-- funcoes internas o papel `authenticated` consegue executar.

alter function public.porto_dashboard_alto_nivel(date, date, text) security definer;

-- 2. UM SOCORRISTA LOGADO ALCANCAVA AS ORDENS DE SERVICO DA EMPRESA INTEIRA.
--
-- `porto_os_filtradas` e a metade de dentro de `porto_listar_os`: aplica os
-- filtros e devolve as OS. Ela e SECURITY DEFINER — precisa ser, para enxergar
-- alem do RLS — mas nasceu com EXECUTE para `authenticated` e sem checagem
-- propria de perfil, porque quem chamava era sempre `porto_listar_os`, que
-- exige administrador antes.
--
-- Fora da tela isso nao valia nada: com a chave anon, que esta no bundle, e a
-- sessao de um socorrista, `POST /rest/v1/rpc/porto_os_filtradas` devolvia as
-- 2.727 OS com valor — enquanto pelo RLS aquela mesma pessoa via 151, so as
-- dela. Nenhuma tela mostrava isso, e usando o sistema nao havia como perceber.
--
-- O revoke nao afeta `porto_listar_os`: dentro de uma funcao SECURITY DEFINER
-- quem executa e o dono, que continua podendo chamar.

revoke execute on function public.porto_os_filtradas(
    date, date, text, text, bigint, text, text, text, boolean, boolean
) from public, anon, authenticated;
