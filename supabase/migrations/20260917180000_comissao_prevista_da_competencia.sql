-- Diario Operacional x OP — etapa 6: comissao prevista, separada da confirmada.
--
-- Comissao so se paga com a OP: e ela que diz quanto a Porto pagou por cada
-- servico. Mas o socorrista que rodou a quinzena inteira quer ter ideia do que
-- vem, e hoje a tela dele fica vazia ate a OP chegar. A prevista responde isso
-- sem se misturar com a confirmada: sai das OS da competencia que ainda nao
-- entraram em OP, sobre o valor informado a mao, e nunca vira despesa.

create or replace function public.porto_comissao_prevista(
    p_inicio date, p_fim date, p_motorista_id bigint default null
)
returns table (
    motorista_id bigint, socorrista text,
    servicos integer, sem_valor integer,
    valor_previsto numeric, comissao_prevista numeric
)
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
    v_pct numeric := public.percentual_comissao();
    v_motorista bigint;
begin
    -- Administrador ve todo mundo (ou um socorrista escolhido); socorrista ve so o dele.
    if public.e_administrador() then
        v_motorista := p_motorista_id;
    else
        v_motorista := public.motorista_atual();
        if v_motorista is null then
            raise exception 'Seu usuário ainda não está vinculado a um socorrista.'
                using errcode = 'insufficient_privilege';
        end if;
        if p_motorista_id is not null and p_motorista_id <> v_motorista then
            raise exception 'Você só pode consultar a própria comissão.'
                using errcode = 'insufficient_privilege';
        end if;
    end if;

    return query
    select os.motorista_id, m.nome,
           count(*)::int,
           count(*) filter (where s.sem_valor)::int,
           coalesce(sum(s.valor_previsto), 0),
           round(coalesce(sum(s.valor_previsto), 0) * v_pct, 2)
      from public.ordens_servico_porto os
      join public.porto_os_situacao() s on s.os_id = os.id
      join public.motoristas m on m.id = os.motorista_id
     where s.competencia_fim between p_inicio and p_fim
       -- Com OP a comissao ja esta confirmada e lancada em despesas.
       and os.ordem_pagamento_id is null
       and (v_motorista is null or os.motorista_id = v_motorista)
     group by os.motorista_id, m.nome
     order by 5 desc, m.nome;
end;
$$;
revoke execute on function public.porto_comissao_prevista(date, date, bigint) from public, anon;
grant execute on function public.porto_comissao_prevista(date, date, bigint) to authenticated;
