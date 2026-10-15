-- Multas (Kawa, 15/10/2026).
--
-- O administrador lanca a multa com a viatura, a data e a hora da infracao, o
-- valor, o numero do auto e o vencimento. O sistema descobre quem estava com a
-- viatura naquele horario pelo turno aberto, e a multa entra como despesa da
-- viatura no nome do socorrista, com o desconto da comissao ja sugerido.
--
-- Decidido com Kawa:
--  * entra na data da infracao, aprovada e "a pagar", com o vencimento da
--    notificacao; vira paga quando o pagamento for registrado no Extrato;
--  * descontar da comissao vem marcado; ele desmarca quando nao for culpa;
--  * sem turno naquele horario, ele escolhe o socorrista a mao (ou deixa so na
--    viatura).
--
-- Nao ha tabela nova: a multa e uma despesa da categoria Multas, com o auto no
-- protocolo. Passa por `registrar_despesa_aprovada`, com as mesmas travas.
--
-- Idempotente: pode rodar de novo no SQL Editor sem efeito colateral.

-- A categoria Multas nasce na primeira vez que for usada, como a de Juros.
create or replace function public.categoria_multas()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_id bigint;
begin
    select c.id into v_id from public.categorias c
     where c.tipo = 'DESPESA' and lower(btrim(c.nome)) = 'multas'
     order by c.id limit 1;
    if v_id is null then
        insert into public.categorias (nome, tipo) values ('Multas', 'DESPESA') returning id into v_id;
    end if;
    return v_id;
end;
$$;
revoke all on function public.categoria_multas() from public, anon, authenticated;

-- O momento da infracao no fuso da operacao: o turno guarda timestamptz.
create or replace function public.momento_da_infracao(p_data date, p_hora time)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
    select (p_data + p_hora) at time zone 'America/Sao_Paulo'
$$;
revoke all on function public.momento_da_infracao(date, time) from public, anon, authenticated;

-- ------------------------------------------------------------------ quem dirigia
-- Turnos daquela viatura abertos naquele momento. Turno ainda aberto conta ate
-- agora. Normalmente vem um; mais de um e erro de registro, e a tela mostra todos.
create or replace function public.quem_estava_na_viatura(p_veiculo_id bigint, p_data date, p_hora time)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_momento timestamptz := public.momento_da_infracao(p_data, p_hora);
    v jsonb;
begin
    perform public.exigir_administrador();
    select coalesce(jsonb_agg(jsonb_build_object(
        'turnoId', t.id, 'motoristaId', t.motorista_id, 'socorrista', m.nome,
        'abertoEm', t.aberto_em, 'fechadoEm', t.fechado_em
    ) order by t.aberto_em desc), '[]'::jsonb) into v
      from public.turnos t
      join public.motoristas m on m.id = t.motorista_id
     where t.veiculo_id = p_veiculo_id
       and t.aberto_em <= v_momento
       and coalesce(t.fechado_em, now()) >= v_momento;
    return v;
end;
$$;
revoke execute on function public.quem_estava_na_viatura(bigint, date, time) from public, anon;
grant execute on function public.quem_estava_na_viatura(bigint, date, time) to authenticated;

-- ------------------------------------------------------------------ lancar
create or replace function public.registrar_multa(
    p_veiculo_id bigint,
    p_data date,
    p_hora time,
    p_valor numeric,
    p_auto text,
    p_vencimento date default null,
    p_motorista_id bigint default null,
    p_desconta_comissao boolean default true,
    p_observacoes text default null
)
returns public.despesas
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_auto text := btrim(coalesce(p_auto, ''));
    v_categoria bigint;
begin
    perform public.exigir_administrador();

    if p_veiculo_id is null or not exists (select 1 from public.veiculos where id = p_veiculo_id) then
        raise exception 'Escolha a viatura da multa.' using errcode = 'invalid_parameter_value';
    end if;
    if p_data is null or p_hora is null then
        raise exception 'Informe a data e a hora da infração.' using errcode = 'invalid_parameter_value';
    end if;
    if public.momento_da_infracao(p_data, p_hora) > now() then
        raise exception 'A data da infração não pode ser no futuro.' using errcode = 'invalid_parameter_value';
    end if;
    if v_auto = '' then
        raise exception 'Informe o número do auto de infração.' using errcode = 'invalid_parameter_value';
    end if;

    v_categoria := public.categoria_multas();

    -- A mesma notificacao duas vezes vira duas despesas: o auto e unico.
    if exists (select 1 from public.despesas d
                where d.categoria_id = v_categoria and upper(btrim(d.protocolo)) = upper(v_auto)) then
        raise exception 'A multa do auto % já foi lançada.', v_auto using errcode = 'unique_violation';
    end if;

    return public.registrar_despesa_aprovada(
        p_descricao => 'Multa · auto ' || v_auto || ' · ' || to_char(p_data, 'DD/MM/YYYY') || ' ' || to_char(p_hora, 'HH24:MI'),
        p_categoria_id => v_categoria,
        p_valor => p_valor,
        p_data => p_data,
        p_vencimento => p_vencimento,
        p_veiculo_id => p_veiculo_id,
        p_motorista_id => p_motorista_id,
        p_protocolo => v_auto,
        p_observacoes => nullif(btrim(coalesce(p_observacoes, '')), ''),
        p_paga => false,
        p_desconta_comissao => coalesce(p_desconta_comissao, true));
end;
$$;
revoke execute on function public.registrar_multa(bigint, date, time, numeric, text, date, bigint, boolean, text) from public, anon;
grant execute on function public.registrar_multa(bigint, date, time, numeric, text, date, bigint, boolean, text) to authenticated;

-- ------------------------------------------------------------------ listar
-- Multas pela data da infracao, com a viatura, quem dirigia e se ja foi paga.
create or replace function public.listar_multas(p_inicio date, p_fim date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v jsonb;
begin
    perform public.exigir_administrador();
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', d.id, 'descricao', d.descricao, 'auto', d.protocolo, 'valor', d.valor,
        'data', d.data_lancamento, 'vencimento', d.vencimento, 'situacao', d.status,
        'dataPagamento', d.data_pagamento, 'descontaComissao', d.desconta_comissao,
        'veiculoId', d.veiculo_id, 'viatura', v.identificacao,
        'motoristaId', d.motorista_id, 'socorrista', m.nome,
        'temComprovante', d.comprovante_arquivo is not null
    ) order by d.data_lancamento desc, d.id desc), '[]'::jsonb) into v
      from public.despesas d
      left join public.veiculos v on v.id = d.veiculo_id
      left join public.motoristas m on m.id = d.motorista_id
     where d.categoria_id = (select c.id from public.categorias c
                              where c.tipo = 'DESPESA' and lower(btrim(c.nome)) = 'multas'
                              order by c.id limit 1)
       and d.data_lancamento between p_inicio and p_fim;
    return v;
end;
$$;
revoke execute on function public.listar_multas(date, date) from public, anon;
grant execute on function public.listar_multas(date, date) to authenticated;
