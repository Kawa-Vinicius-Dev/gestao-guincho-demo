-- Faturamento por viatura passa a vir da OS, pela sigla.
--
-- O resultado por viatura da Visao geral somava receitas com veiculo_id
-- preenchido. A importacao da Porto cria a receita sem viatura, entao todo o
-- faturamento da Porto ficava fora e o grafico mostrava so custo. O servico sabe
-- em qual viatura foi feito (sigla_viatura, que vem do painel diario); o
-- cadastro sabe a sigla de cada viatura (sigla_porto). A ligacao e essa.
--
-- Para a ligacao funcionar, a sigla do painel diario precisa sobreviver a
-- importacao da OP. O relatorio da OP traz a coluna vazia, a importacao gravava
-- '' e o `coalesce(excluded.sigla_viatura, ...)` do upsert trocava a sigla boa
-- pelo texto vazio, porque '' nao e nulo. O mesmo valia para socorrista e QRA.
-- E a "escala do dia" (mesmo dia, mesma viatura) casava OS sem sigla entre si,
-- tratando '' como se fosse uma viatura.

-- 1. Coluna de texto vazia chega como nula: nao apaga o que outro relatorio trouxe.
do $$
declare v_def text; v_antes text; v_depois text;
begin
    select pg_get_functiondef('public.porto_confirmar_importacao'::regproc) into v_def;

    v_antes := 'v_linha ->> ''especialidade'', v_linha ->> ''sigla_viatura'',
                v_linha ->> ''socorrista'', v_linha ->> ''qra'',';
    v_depois := 'nullif(btrim(v_linha ->> ''especialidade''), ''''),
                nullif(btrim(v_linha ->> ''sigla_viatura''), ''''),
                nullif(btrim(v_linha ->> ''socorrista''), ''''),
                nullif(btrim(v_linha ->> ''qra''), ''''),';
    if position(v_antes in v_def) = 0 then
        raise exception 'colunas de texto da OS nao encontradas em porto_confirmar_importacao';
    end if;
    v_def := replace(v_def, v_antes, v_depois);

    v_antes := 'v_linha ->> ''prestador'', v_linha ->> ''seguradora'',
                v_linha ->> ''cliente'', v_linha ->> ''placa'',';
    v_depois := 'nullif(btrim(v_linha ->> ''prestador''), ''''),
                nullif(btrim(v_linha ->> ''seguradora''), ''''),
                nullif(btrim(v_linha ->> ''cliente''), ''''),
                nullif(btrim(v_linha ->> ''placa''), ''''),';
    if position(v_antes in v_def) = 0 then
        raise exception 'colunas de cadastro da OS nao encontradas em porto_confirmar_importacao';
    end if;

    execute replace(v_def, v_antes, v_depois);
end $$;

-- As OS ja importadas com texto vazio passam a nulo, para o proximo painel
-- diario conseguir preencher.
update public.ordens_servico_porto
   set sigla_viatura = case when btrim(sigla_viatura) = '' then null else sigla_viatura end,
       socorrista = case when btrim(socorrista) = '' then null else socorrista end,
       qra = case when btrim(qra) = '' then null else qra end
 where btrim(sigla_viatura) = '' or btrim(socorrista) = '' or btrim(qra) = '';

-- 2. Receita por viatura: servico recebido pela sigla, mais receita manual com viatura.
do $$
declare v_def text; v_antes text; v_depois text;
begin
    select pg_get_functiondef('public.dashboard_financeiro'::regproc) into v_def;

    v_antes := 'select r.id, r.valor, r.status, r.veiculo_id
        from public.receitas r';
    v_depois := 'select r.id, r.valor, r.status, r.veiculo_id, r.ordem_servico_porto_id
        from public.receitas r';
    if position(v_antes in v_def) = 0 then
        raise exception 'receitas_periodo nao encontrado em dashboard_financeiro';
    end if;
    v_def := replace(v_def, v_antes, v_depois);

    v_antes := 'left join (
            select veiculo_id, sum(valor) as receitas
            from receitas_periodo where status = ''RECEBIDA'' and veiculo_id is not null
            group by veiculo_id
        ) r on r.veiculo_id = v.id';
    -- A receita da Porto entra pela OS; a parte das receitas fica so com as que
    -- nao vieram de OS, para o mesmo servico nunca contar duas vezes.
    v_depois := 'left join (
            select x.veiculo_id, sum(x.valor) as receitas
            from (
                select ve.id as veiculo_id, os.valor_total as valor
                from oss_periodo os
                join public.ordens_servico_porto o2 on o2.id = os.id
                join public.veiculos ve
                  on upper(btrim(ve.sigla_porto)) = upper(btrim(o2.sigla_viatura))
                where os.status_financeiro = ''RECEBIDO''
                  and os.status_operacional <> ''CANCELADO''
                union all
                select rp.veiculo_id, rp.valor
                from receitas_periodo rp
                where rp.status = ''RECEBIDA'' and rp.veiculo_id is not null
                  and rp.ordem_servico_porto_id is null
            ) x
            group by x.veiculo_id
        ) r on r.veiculo_id = v.id';
    if position(v_antes in v_def) = 0 then
        raise exception 'receita por veiculo nao encontrada em dashboard_financeiro';
    end if;

    execute replace(v_def, v_antes, v_depois);
end $$;
