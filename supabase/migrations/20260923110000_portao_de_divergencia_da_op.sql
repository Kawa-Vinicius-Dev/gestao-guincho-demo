-- Portao de divergencia da OP, tambem no banco.
--
-- Kawa, 23/09/2026 ("faca o que achar necessario"): a tela ja pede confirmacao,
-- motivo e justificativa quando a soma do arquivo difere do valor da OP (credito,
-- desconto — ou arquivo de outra OP, ou numero da OP errado). O banco aceitava
-- sem nada disso. Agora recusa tambem: um arquivo errado nao reescreve o valor
-- de uma OP em silencio, venha por onde vier.
--
-- So vale para OP que ja tem valor (OP nova ainda nao tem com que comparar).
-- Idempotente: pode rodar de novo no SQL Editor sem efeito colateral.
do $$
declare
    v_def text := pg_get_functiondef(
        'public.porto_confirmar_importacao(bigint,jsonb,text,bigint,text,text,boolean,numeric)'::regprocedure);
    v_antes constant text := E'        v_diferenca := v_op.valor_total - v_soma;\n';
    v_depois constant text := E'        v_diferenca := v_op.valor_total - v_soma;\n'
        || E'        -- Portao de divergencia (23/09/2026): OP com valor e arquivo que nao bate\n'
        || E'        -- so passam com confirmacao, motivo e justificativa.\n'
        || E'        if coalesce(v_op.valor_total, 0) > 0 and abs(v_diferenca) > 0.01\n'
        || E'           and (not coalesce(p_confirmar_divergencias, false)\n'
        || E'                or p_motivo_divergencia is null\n'
        || E'                or btrim(coalesce(p_justificativa, \'\')) = \'\') then\n'
        || E'            raise exception \'A soma do arquivo difere do valor da OP. Confirme a diferença, escolha o motivo e escreva a justificativa.\'\n'
        || E'                using errcode = \'invalid_parameter_value\';\n'
        || E'        end if;\n';
begin
    if position('Portao de divergencia (23/09/2026)' in v_def) > 0 then return; end if;
    if position(v_antes in v_def) = 0 then
        raise exception 'porto_confirmar_importacao nao tem o trecho esperado; revisar esta migration';
    end if;
    execute replace(v_def, v_antes, v_depois);
end $$;
