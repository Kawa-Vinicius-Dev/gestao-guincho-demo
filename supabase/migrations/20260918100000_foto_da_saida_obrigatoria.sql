-- Foto do painel obrigatoria tambem na saida do turno.
--
-- No desenho original a foto era obrigatoria no fechamento e opcional na
-- abertura. Kawa decidiu em 18/09/2026: "foto do painel obrigatoria" — nos dois
-- momentos. A abertura nao consegue exigir a foto no proprio insert, porque o
-- arquivo sobe depois do turno existir (o caminho no Storage carrega o id dele).
-- Por isso a trava fica no passo seguinte: sem foto da saida, o turno nao fecha.
-- A tela pede a foto e oferece reenviar quando o envio falha, e esta funcao
-- garante que nenhum caminho por fora da tela pule a regra.

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
begin
    select t.hodometro_inicial, t.foto_abertura into v_inicial, v_foto_saida
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
