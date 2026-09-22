-- A despesa de comissao diz de quem e e de qual OP.
--
-- Kawa, 22/09/2026: a despesa que o sistema lanca sozinho tem de entrar no
-- extrato "com o nome do socorrista e o numero da OP", no formato "socorrista
-- tal, comissao da OP tal", e o nome leva direto para a comissao dele.
--
-- Antes todas se chamavam "Comissao de socorrista — OP 123": no extrato, dez
-- linhas iguais, e so abrindo cada uma dava para saber de quem era o dinheiro.
--
-- Idempotente: pode rodar de novo no SQL Editor sem efeito colateral.

-- ---------------------------------------------------------------- o texto
-- Um lugar so decide como a linha se chama. A sincronizacao chama isto na hora
-- de lancar e na hora de acertar, e o texto nao tem como divergir entre os dois.
create or replace function public.descricao_da_comissao(p_numero_op text, p_motorista_id bigint)
returns text
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce((select m.nome from public.motoristas m where m.id = p_motorista_id), 'Socorrista')
        || ' — comissão da OP ' || p_numero_op
$$;
revoke execute on function public.descricao_da_comissao(text, bigint) from public, anon;

-- ---------------------------------------------------------------- sincronizacao
-- Mesma cirurgia de texto das migrations anteriores: trocar so o que muda, e
-- recusar se o trecho esperado nao estiver la — melhor falhar aqui do que
-- lancar comissao com o texto velho sem ninguem perceber.
do $$
declare
    v_def text := pg_get_functiondef('public.porto_sincronizar_comissoes()'::regprocedure);
    v_velho_texto constant text := '''Comissão de socorrista — OP '' || r.numero';
    v_novo_texto constant text := 'public.descricao_da_comissao(r.numero, r.motorista_id)';
    v_velha_condicao constant text :=
        '(valor is distinct from r.liquido or data_lancamento is distinct from r.periodo_fim);';
    v_nova_condicao constant text :=
        '(valor is distinct from r.liquido or data_lancamento is distinct from r.periodo_fim'
        || ' or descricao is distinct from public.descricao_da_comissao(r.numero, r.motorista_id));';
begin
    if position(v_novo_texto in v_def) > 0 then
        return; -- ja aplicada
    end if;
    if position(v_velho_texto in v_def) = 0 or position(v_velha_condicao in v_def) = 0 then
        raise exception 'porto_sincronizar_comissoes nao tem o trecho esperado; revisar esta migration';
    end if;
    v_def := replace(v_def, v_velho_texto, v_novo_texto);
    v_def := replace(v_def, v_velha_condicao, v_nova_condicao);
    execute v_def;
end;
$$;

-- ---------------------------------------------------------------- extrato
-- O extrato passa a entregar quem (motorista_id) e de qual OP (numero_op) a
-- linha veio, para a tela montar o link sem adivinhar pelo texto.
-- Mudar o retorno de uma funcao exige derruba-la; os grants voltam logo abaixo.
drop function if exists public.extrato_financeiro(date, date);
create function public.extrato_financeiro(p_inicio date, p_fim date)
returns table(id text, tipo text, referencia_id bigint, descricao text, categoria text,
              valor numeric, data date, status text, realizado boolean, veiculo text,
              veiculo_id bigint, motorista text, origem text, protocolo text,
              motorista_id bigint, numero_op text)
language sql
stable
set search_path = ''
as $$
    select 'R' || r.id::text, 'RECEITA', r.id, r.descricao,
           coalesce(c.nome, 'Sem categoria'), r.valor, r.data_competencia,
           r.status::text, r.status = 'RECEBIDA', v.identificacao, r.veiculo_id,
           m.nome, case when r.manual then 'MANUAL' else 'IMPORTADA' end, null::text,
           r.motorista_id, null::text
    from public.receitas r
    left join public.categorias c on c.id = r.categoria_id
    left join public.veiculos v on v.id = r.veiculo_id
    left join public.motoristas m on m.id = r.motorista_id
    where r.data_competencia between p_inicio and p_fim
      and public.e_administrador()

    union all

    select 'D' || d.id::text, 'DESPESA', d.id, d.descricao,
           c.nome, d.valor, d.data_lancamento,
           d.status::text, d.status = 'PAGO', v.identificacao, d.veiculo_id,
           m.nome,
           case when pc.despesa_id is not null then 'COMISSAO'
                when d.despesa_recorrente_id is null then 'MANUAL'
                else 'RECORRENTE' end,
           d.protocolo,
           d.motorista_id, op.numero
    from public.despesas d
    join public.categorias c on c.id = d.categoria_id
    left join public.veiculos v on v.id = d.veiculo_id
    left join public.motoristas m on m.id = d.motorista_id
    left join public.pagamentos_comissao pc on pc.despesa_id = d.id
    left join public.ordens_pagamento_porto op on op.id = pc.ordem_pagamento_id
    where d.data_lancamento between p_inicio and p_fim
      and public.e_administrador()

    order by 7 desc, 1
$$;
revoke execute on function public.extrato_financeiro(date, date) from public;
revoke execute on function public.extrato_financeiro(date, date) from anon;
grant execute on function public.extrato_financeiro(date, date) to authenticated;

-- ---------------------------------------------------------------- as que ja existem
-- A condicao nova da sincronizacao acerta o texto das comissoes ja lancadas.
select public.porto_sincronizar_comissoes();
