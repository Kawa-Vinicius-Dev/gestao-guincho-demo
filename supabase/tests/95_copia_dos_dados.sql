-- A copia dos dados precisa conseguir ler o que ela pede.
--
-- O banco esta num plano sem backup automatico: a copia que o dono baixa em
-- Configuracoes e a unica protecao que existe. Ela ficou quebrada sem ninguem
-- saber, porque quatro listas pediam coluna que nao existe (veiculos.ano,
-- motoristas.email, motoristas.percentual_comissao, e tres de quilometragens
-- que a tela calcula em vez de guardar). Como as tabelas sao lidas em paralelo
-- e a primeira falha derruba todas, o botao nao produzia arquivo nenhum.
--
-- As listas abaixo espelham TABELAS em frontend/src/dados/backup.ts. Quando o
-- esquema mudar e alguem esquecer a copia, esta suite avisa — e nao o dono, no
-- dia em que precisar do backup.
\set ON_ERROR_STOP on

do $$
declare
    r record;
    v_faltando text;
begin
    for r in
        select * from (values
            ('veiculos',               'id,identificacao,placa,modelo,custo_por_km,sigla_porto,ativo'),
            ('motoristas',             'id,nome,qra,telefone,documento,codigos_porto,veiculo_id,ativo'),
            ('contratantes',           'id,nome,documento,ativo'),
            ('categorias',             'id,nome,tipo,ativo'),
            ('despesas',               'id,descricao,categoria_id,valor,data_lancamento,vencimento,data_pagamento,status,natureza,veiculo_id,motorista_id,protocolo,observacoes'),
            ('receitas',               'id,descricao,valor,data_competencia,data_recebimento,status,contratante_id,categoria_id,veiculo_id,motorista_id,observacoes'),
            ('contas_receber',         'id,contratante_id,protocolo,descricao,valor_previsto,valor_recebido,data_competencia,vencimento,data_recebimento,status,origem'),
            ('quilometragens',         'id,data_registro,veiculo_id,motorista_id,hodometro_inicial,hodometro_final,km_remunerado,custo_por_km,observacoes,protocolo'),
            ('ordens_pagamento_porto', 'id,numero,valor_total,nome_codigo,data_pagamento_programada,valor_recebido,data_recebimento,situacao_financeira,calendario_pagamento_id'),
            ('ordens_servico_porto',   'id,numero,ordem_pagamento_id,valor_total,especialidade,sigla_viatura,socorrista,qra,motorista_id,data_atendimento,status_operacional,status_financeiro')
        ) as t(tabela, colunas)
    loop
        select string_agg(c, ', ') into v_faltando
          from unnest(string_to_array(r.colunas, ',')) as c
         where not exists (
             select 1 from information_schema.columns ic
              where ic.table_schema = 'public'
                and ic.table_name = r.tabela
                and ic.column_name = c);

        if v_faltando is not null then
            raise exception 'FALHOU  | copia de % pede coluna que nao existe: %', r.tabela, v_faltando;
        end if;
        raise notice 'PASSOU  | copia de % le todas as colunas que pede', r.tabela;
    end loop;
end $$;

\echo 'TODOS OS TESTES PASSARAM'
