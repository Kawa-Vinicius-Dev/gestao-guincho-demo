-- Varredura da logica do modulo Porto contra as regras que o Kawa definiu.
-- Quatro defeitos, cada um confirmado em ensaio no banco real antes de corrigir.

-- 1. Numero da OS: as OS ja importadas ficaram com a chave antiga.
--
-- A regra "miolo + ano" (20260915120000) trocou a funcao, mas as 275 OS da
-- primeira OP continuaram com a chave calculada do jeito antigo, com o prefixo:
-- "01/2667352-26" gravado como 01266735226 em vez de 266735226. O painel diario
-- escreve 2667352/26 — nao casava, e cada OS da OP viraria uma segunda linha.
-- Recalcular nao gera colisao (conferido: zero chaves repetidas).
update public.ordens_servico_porto
   set numero_normalizado = public.numero_os_normalizado(numero)
 where numero_normalizado is distinct from public.numero_os_normalizado(numero);

-- 2. OS ja paga nao volta a "aguardando OP".
--
-- O painel diario e colado todo dia e a mesma OS reaparece com a situacao da
-- Porto mudada — hash novo, entao ela e reimportada. O upsert copiava o status do
-- painel (AGUARDANDO_OP) por cima do RECEBIDO da OP: a OS saia da producao paga e
-- da comissao, enquanto a receita dela continuava no caixa. Quem paga e a OP; o
-- painel do dia nao desfaz pagamento nem cancela servico que a Porto pagou.
do $$
declare v_def text; v_antes text; v_depois text;
begin
    select pg_get_functiondef('public.porto_confirmar_importacao'::regproc) into v_def;
    v_antes := '                   status_financeiro = excluded.status_financeiro,
                   status_operacional = excluded.status_operacional,';
    v_depois := '                   status_financeiro = case
                       when public.ordens_servico_porto.status_financeiro = ''RECEBIDO''
                       then public.ordens_servico_porto.status_financeiro
                       else excluded.status_financeiro end,
                   status_operacional = case
                       when public.ordens_servico_porto.status_financeiro = ''RECEBIDO''
                        and excluded.status_operacional = ''CANCELADO''
                       then public.ordens_servico_porto.status_operacional
                       else excluded.status_operacional end,';
    if position(v_antes in v_def) = 0 then
        raise exception 'status do upsert nao encontrado em porto_confirmar_importacao';
    end if;
    execute replace(v_def, v_antes, v_depois);
end $$;

-- 3. Servico cancelado fica registrado e fora da conta.
--
-- O painel Porto contava o cancelado em "servicos realizados" e em "aguardando
-- OP", e a Visao geral em "servicos". Pendencias, comissao, relatorio diario e o
-- grafico ja o deixavam de fora; os dois totais agora tambem.
do $$
declare v_def text; v_antes text; v_depois text;
begin
    select pg_get_functiondef('public.porto_dashboard'::regproc) into v_def;
    v_antes := '        where (p_inicio is null or coalesce(op.periodo_fim, os.data_atendimento) >= p_inicio)';
    v_depois := '        where os.status_operacional <> ''CANCELADO''
          and (p_inicio is null or coalesce(op.periodo_fim, os.data_atendimento) >= p_inicio)';
    if position(v_antes in v_def) = 0 then
        raise exception 'filtro de periodo nao encontrado em porto_dashboard';
    end if;
    execute replace(v_def, v_antes, v_depois);

    select pg_get_functiondef('public.dashboard_financeiro'::regproc) into v_def;
    v_antes := '        where coalesce(op.periodo_fim, os.data_atendimento) between p_inicio and p_fim
';
    v_depois := '        where coalesce(op.periodo_fim, os.data_atendimento) between p_inicio and p_fim
          and os.status_operacional <> ''CANCELADO''
';
    if position(v_antes in v_def) = 0 then
        raise exception 'filtro de periodo nao encontrado em dashboard_financeiro';
    end if;
    execute replace(v_def, v_antes, v_depois);
end $$;

-- 4. Fechar OP e passo interno da importacao, nao chamada publica.
--
-- porto_fechar_op roda como dono do banco e nao confere perfil: qualquer usuario
-- logado, funcionario inclusive, podia chamar /rpc/porto_fechar_op e reescrever
-- valor, periodo e datas de uma OP. Quem a usa e porto_confirmar_importacao, que
-- tambem roda como dono, entao tirar o acesso direto nao muda a importacao.
revoke execute on function public.porto_fechar_op(bigint) from public, anon, authenticated;
