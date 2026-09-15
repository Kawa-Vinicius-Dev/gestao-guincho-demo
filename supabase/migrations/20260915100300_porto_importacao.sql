-- Importacao Porto: o navegador le o arquivo, o banco aplica.
--
-- A divisao segue a prioridade da migracao: ler texto e trabalho do navegador
-- (sem segredo, sem privilegio); aplicar as linhas e trabalho do banco, porque
-- envolve varias tabelas e precisa ser tudo ou nada — uma OS gravada sem a
-- receita correspondente deixaria dinheiro fora do caixa.

-- Registra o arquivo. O hash impede reimportar o mesmo conteudo duas vezes.
create or replace function public.porto_registrar_importacao(
    p_nome_arquivo text, p_hash text, p_tipo public.tipo_relatorio_porto,
    p_total_registros integer, p_caminho text default null
)
returns public.importacoes_porto
language plpgsql
security definer
set search_path = ''
as $$
declare v public.importacoes_porto;
begin
    perform public.exigir_administrador();

    select * into v from public.importacoes_porto where hash_arquivo = p_hash;
    if found then
        if v.status = 'CONFIRMADA' then
            raise exception 'Este arquivo já foi importado e confirmado.'
                using errcode = 'unique_violation';
        end if;
        -- Previa refeita sobre o mesmo arquivo reaproveita o registro.
        update public.importacoes_porto
           set tipo_relatorio = p_tipo, total_registros = p_total_registros,
               status = 'AGUARDANDO_CONFERENCIA', caminho_arquivo = coalesce(p_caminho, caminho_arquivo)
         where id = v.id returning * into v;
        return v;
    end if;

    insert into public.importacoes_porto (
        nome_arquivo, hash_arquivo, caminho_arquivo, tipo_relatorio,
        status, total_registros, criado_por
    ) values (
        p_nome_arquivo, p_hash, p_caminho, p_tipo,
        'AGUARDANDO_CONFERENCIA', p_total_registros, (select auth.uid())
    ) returning * into v;
    return v;
end;
$$;

/*
 * Aplica as linhas de uma importacao, tudo ou nada.
 *
 * `p_linhas` e um array de objetos com as chaves normalizadas pelo parser do
 * frontend (numero_os, numero_op, valor_total, data_atendimento, ...). Cada
 * linha traz `hash_registro`: registro ja absorvido e ignorado, que e o que faz
 * reenviar o mesmo relatorio ser inofensivo.
 *
 * O que cada tipo de relatorio faz:
 *   PREVISAO_RECEBER     cria/atualiza a OP com valor e data programada
 *   OS_VINCULADAS        cria/atualiza a OS ligada a OP e gera o financeiro
 *   SERVICOS_GERAIS      idem
 *   SERVICOS_DEVOLVIDOS  cria/atualiza a OS e abre pendencia de devolucao
 *   PAINEL_DIARIO        cria a OS aguardando OP, sem valor
 *   SERVICOS_AGUARDANDO_LANCAMENTO  cria a OS aguardando lancamento
 */
create or replace function public.porto_confirmar_importacao(
    p_importacao_id bigint,
    p_linhas jsonb,
    p_numero_op text default null,
    p_calendario_id bigint default null,
    p_motivo_divergencia text default null,
    p_justificativa text default null,
    p_confirmar_divergencias boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_imp public.importacoes_porto;
    v_op public.ordens_pagamento_porto;
    v_cal public.calendario_pagamentos_porto;
    v_quem uuid := (select auth.uid());
    v_linha jsonb;
    v_numero text;
    v_hash text;
    v_os_id bigint; v_os_numero text; v_os_valor numeric;
    v_os_motorista bigint; v_os_manual boolean;
    v_os_qra text; v_os_sigla text; v_os_devolucao date;
    v_atualizado boolean;
    v_contratante bigint; v_categoria bigint; v_conta bigint;
    v_importados int := 0; v_ignorados int := 0; v_novos int := 0;
    v_atualizados int := 0; v_receitas int := 0;
    v_soma numeric := 0; v_diferenca numeric;
    v_paga boolean;
    v_vistos text[] := '{}';
begin
    perform public.exigir_administrador();

    select * into v_imp from public.importacoes_porto where id = p_importacao_id for update;
    if not found then
        raise exception 'Importação não encontrada.' using errcode = 'no_data_found';
    end if;
    if v_imp.status = 'CONFIRMADA' then
        raise exception 'Esta importação já foi confirmada.' using errcode = 'invalid_parameter_value';
    end if;

    -- Relatorio que traz dinheiro precisa de OP e de ciclo; os demais nao.
    v_paga := v_imp.tipo_relatorio in ('OS_VINCULADAS', 'SERVICOS_GERAIS');

    if v_paga then
        if p_numero_op is null or btrim(p_numero_op) = '' then
            raise exception 'Informe o número da OP antes de confirmar.'
                using errcode = 'invalid_parameter_value';
        end if;
        select * into v_op from public.ordens_pagamento_porto
         where upper(btrim(numero)) = upper(btrim(p_numero_op)) for update;
        if not found then
            insert into public.ordens_pagamento_porto (numero, importacao_id)
            values (btrim(p_numero_op), p_importacao_id) returning * into v_op;
        end if;

        select * into v_cal from public.calendario_pagamentos_porto
         where id = coalesce(p_calendario_id, v_op.calendario_pagamento_id);
        if not found then
            raise exception 'Informe o ciclo de pagamento.' using errcode = 'invalid_parameter_value';
        end if;

        -- A soma do arquivo contra o valor ja registrado na OP. Divergir exige
        -- confirmacao explicita E justificativa, como o backend exigia.
        select coalesce(sum((l ->> 'valor_total')::numeric), 0) into v_soma
          from jsonb_array_elements(p_linhas) l;
        v_diferenca := v_op.valor_total - v_soma;
        if v_op.valor_total <> 0 and abs(v_diferenca) > 0.01
           and (not coalesce(p_confirmar_divergencias, false)
                or p_motivo_divergencia is null
                or coalesce(btrim(p_justificativa), '') = '') then
            raise exception 'A soma do arquivo diverge do valor da OP; confirme a divergência e informe motivo e justificativa.'
                using errcode = 'invalid_parameter_value';
        end if;
    end if;

    for v_linha in select * from jsonb_array_elements(p_linhas) loop
        v_hash := v_linha ->> 'hash_registro';
        v_numero := coalesce(v_linha ->> 'numero_os', v_linha ->> 'numero_op');

        -- Numero repetido dentro do mesmo arquivo conta uma vez so.
        if v_numero is null or btrim(v_numero) = '' or v_numero = any(v_vistos) then
            v_ignorados := v_ignorados + 1; continue;
        end if;
        v_vistos := v_vistos || v_numero;

        -- Registro ja absorvido numa importacao anterior.
        if exists (select 1 from public.registros_importados_porto
                    where hash_registro = v_hash and tipo_relatorio = v_imp.tipo_relatorio) then
            v_ignorados := v_ignorados + 1; continue;
        end if;

        if v_imp.tipo_relatorio = 'PREVISAO_RECEBER' then
            insert into public.ordens_pagamento_porto (
                numero, valor_total, nome_codigo, data_pagamento_programada, importacao_id
            ) values (
                btrim(v_numero), coalesce((v_linha ->> 'valor_total')::numeric, 0),
                v_linha ->> 'nome_codigo', nullif(v_linha ->> 'data_pagamento', '')::date,
                p_importacao_id
            )
            on conflict (upper(btrim(numero))) do update
               set valor_total = excluded.valor_total,
                   nome_codigo = coalesce(excluded.nome_codigo, public.ordens_pagamento_porto.nome_codigo),
                   data_pagamento_programada = coalesce(excluded.data_pagamento_programada,
                       public.ordens_pagamento_porto.data_pagamento_programada)
            -- xmax nao-zero identifica a linha que veio do DO UPDATE.
            returning (xmax <> 0) into v_atualizado;

            if v_atualizado then v_atualizados := v_atualizados + 1;
            else v_novos := v_novos + 1; end if;
        else
            -- Numero normalizado: a Porto escreve "5632135/26" e "563213526"
            -- para a mesma OS entre relatorios.
            insert into public.ordens_servico_porto (
                numero, numero_normalizado, ordem_pagamento_id, valor_total,
                especialidade, sigla_viatura, socorrista, qra, data_atendimento,
                data_devolucao, data_finalizacao_devolucao, valor_km_excedente,
                km_morto_estimado, prestador, seguradora, cliente, placa,
                status_financeiro, status_operacional, importacao_id
            ) values (
                btrim(v_numero), regexp_replace(v_numero, '[^0-9]', '', 'g'),
                v_op.id, coalesce((v_linha ->> 'valor_total')::numeric, 0),
                v_linha ->> 'especialidade', v_linha ->> 'sigla_viatura',
                v_linha ->> 'socorrista', v_linha ->> 'qra',
                nullif(v_linha ->> 'data_atendimento', '')::date,
                nullif(v_linha ->> 'data_devolucao', '')::date,
                nullif(v_linha ->> 'data_finalizacao', '')::date,
                nullif(v_linha ->> 'valor_km_excedente', '')::numeric,
                nullif(v_linha ->> 'km_morto_estimado', '')::numeric,
                v_linha ->> 'prestador', v_linha ->> 'seguradora',
                v_linha ->> 'cliente', v_linha ->> 'placa',
                case when v_paga then 'RECEBIDO'
                     when v_imp.tipo_relatorio = 'SERVICOS_AGUARDANDO_LANCAMENTO' then 'A_CONFIRMAR'
                     else 'AGUARDANDO_OP' end::public.status_financeiro_porto,
                case when v_imp.tipo_relatorio = 'SERVICOS_DEVOLVIDOS' then 'DEVOLVIDO_FINALIZADO'
                     when v_imp.tipo_relatorio = 'SERVICOS_AGUARDANDO_LANCAMENTO' then 'AGUARDANDO_LANCAMENTO'
                     else 'NORMAL' end::public.status_operacional_porto,
                p_importacao_id
            )
            on conflict (numero_normalizado) do update
               set ordem_pagamento_id = coalesce(excluded.ordem_pagamento_id,
                       public.ordens_servico_porto.ordem_pagamento_id),
                   -- Relatorio sem valor (painel diario) nao zera o valor ja conhecido.
                   valor_total = case when excluded.valor_total > 0
                       then excluded.valor_total else public.ordens_servico_porto.valor_total end,
                   especialidade = coalesce(excluded.especialidade, public.ordens_servico_porto.especialidade),
                   sigla_viatura = coalesce(excluded.sigla_viatura, public.ordens_servico_porto.sigla_viatura),
                   socorrista = coalesce(excluded.socorrista, public.ordens_servico_porto.socorrista),
                   qra = coalesce(excluded.qra, public.ordens_servico_porto.qra),
                   data_atendimento = coalesce(excluded.data_atendimento, public.ordens_servico_porto.data_atendimento),
                   data_devolucao = coalesce(excluded.data_devolucao, public.ordens_servico_porto.data_devolucao),
                   data_finalizacao_devolucao = coalesce(excluded.data_finalizacao_devolucao,
                       public.ordens_servico_porto.data_finalizacao_devolucao),
                   placa = coalesce(excluded.placa, public.ordens_servico_porto.placa),
                   status_financeiro = excluded.status_financeiro,
                   status_operacional = excluded.status_operacional,
                   importacao_id = excluded.importacao_id
            returning id, numero, valor_total, motorista_id, motorista_vinculo_manual,
                      qra, sigla_viatura, data_devolucao, (xmax <> 0)
                 into v_os_id, v_os_numero, v_os_valor, v_os_motorista, v_os_manual,
                      v_os_qra, v_os_sigla, v_os_devolucao, v_atualizado;

            -- QRA identifica o socorrista; a viatura e o palpite seguinte. Vinculo
            -- feito a mao pelo administrador nunca e sobrescrito.
            if v_os_motorista is null and not v_os_manual then
                update public.ordens_servico_porto
                   set motorista_id = coalesce(
                       (select m.id from public.motoristas m
                         where v_os_qra is not null and m.qra is not null
                           and upper(btrim(m.qra)) = upper(btrim(v_os_qra)) limit 1),
                       (select m.id from public.motoristas m
                         join public.veiculos ve on ve.id = m.veiculo_id
                        where v_os_sigla is not null and ve.sigla_porto is not null
                          and upper(btrim(ve.sigla_porto)) = upper(btrim(v_os_sigla)) limit 1))
                 where id = v_os_id
                returning motorista_id into v_os_motorista;
            end if;

            -- Servico devolvido abre pendencia, se ainda nao houver uma aberta.
            if v_imp.tipo_relatorio = 'SERVICOS_DEVOLVIDOS' then
                insert into public.pendencias_porto (
                    ordem_servico_id, tipo, valor, data_devolucao, importacao_id
                ) values (
                    v_os_id, 'SERVICO_DEVOLVIDO', v_os_valor,
                    coalesce(v_os_devolucao, current_date), p_importacao_id
                ) on conflict do nothing;
            end if;

            -- Relatorio pago cria o lado financeiro da OS. Sem isso a OS ficaria
            -- marcada como recebida e o dinheiro nao apareceria no caixa.
            if v_paga and v_os_valor > 0 then
                select id into v_contratante from public.contratantes
                 where lower(btrim(nome)) = 'porto seguro' limit 1;
                if v_contratante is null then
                    insert into public.contratantes (nome) values ('Porto Seguro')
                    returning id into v_contratante;
                end if;
                select id into v_categoria from public.categorias
                 where lower(btrim(nome)) = 'serviços de guincho' and tipo = 'RECEITA' limit 1;
                if v_categoria is null then
                    insert into public.categorias (nome, tipo)
                    values ('Serviços de guincho', 'RECEITA') returning id into v_categoria;
                end if;

                insert into public.contas_receber (
                    contratante_id, descricao, valor_previsto, valor_recebido,
                    data_competencia, vencimento, data_recebimento, status, origem,
                    motorista_id, importacao_id, ordem_servico_porto_id, ordem_pagamento_porto_id
                ) values (
                    v_contratante, 'OS ' || v_os_numero, v_os_valor, v_os_valor,
                    v_cal.data_pagamento, v_cal.data_pagamento, v_cal.data_pagamento,
                    'RECEBIDO', 'IMPORTADA', v_os_motorista, p_importacao_id, v_os_id, v_op.id
                )
                on conflict (ordem_servico_porto_id) where ordem_servico_porto_id is not null
                do update set valor_previsto = excluded.valor_previsto,
                              valor_recebido = excluded.valor_recebido,
                              motorista_id = coalesce(excluded.motorista_id,
                                  public.contas_receber.motorista_id),
                              ordem_pagamento_porto_id = excluded.ordem_pagamento_porto_id
                returning id into v_conta;

                insert into public.receitas (
                    descricao, valor, data_competencia, data_recebimento, status,
                    contratante_id, categoria_id, motorista_id, conta_receber_id,
                    importacao_id, ordem_servico_porto_id, ordem_pagamento_porto_id
                ) values (
                    'OS ' || v_os_numero, v_os_valor, v_cal.data_pagamento,
                    v_cal.data_pagamento, 'RECEBIDA', v_contratante, v_categoria,
                    v_os_motorista, v_conta, p_importacao_id, v_os_id, v_op.id
                )
                on conflict (ordem_servico_porto_id) where ordem_servico_porto_id is not null
                do update set valor = excluded.valor,
                              motorista_id = coalesce(excluded.motorista_id,
                                  public.receitas.motorista_id),
                              conta_receber_id = excluded.conta_receber_id,
                              ordem_pagamento_porto_id = excluded.ordem_pagamento_porto_id;
                v_receitas := v_receitas + 1;
            end if;

            if v_atualizado then v_atualizados := v_atualizados + 1;
            else v_novos := v_novos + 1; end if;
        end if;

        insert into public.registros_importados_porto (importacao_id, hash_registro, tipo_relatorio)
        values (p_importacao_id, v_hash, v_imp.tipo_relatorio)
        on conflict (hash_registro, tipo_relatorio) do nothing;
        v_importados := v_importados + 1;
    end loop;

    -- A OP passa a valer a soma das OSs que a compoem.
    if v_op.id is not null then
        update public.ordens_pagamento_porto
           set valor_total = coalesce((select sum(valor_total) from public.ordens_servico_porto
                                        where ordem_pagamento_id = v_op.id), 0),
               calendario_pagamento_id = v_cal.id,
               data_pagamento_programada = coalesce(data_pagamento_programada, v_cal.data_pagamento),
               importacao_id = coalesce(importacao_id, p_importacao_id)
         where id = v_op.id;

        if v_diferenca is not null and abs(v_diferenca) > 0.01 and p_motivo_divergencia is not null then
            insert into public.justificativas_porto (
                ordem_pagamento_id, motivo, observacao, valor_diferenca, criado_por
            ) values (
                v_op.id, p_motivo_divergencia::public.motivo_justificativa_porto,
                p_justificativa, v_diferenca, v_quem
            );
        end if;

        insert into public.historico_porto (ordem_pagamento_id, evento, descricao, criado_por)
        values (v_op.id, 'IMPORTACAO',
                v_novos::text || ' registro(s) novo(s), ' || v_atualizados::text || ' atualizado(s), '
                || v_ignorados::text || ' ignorado(s)', v_quem);
    end if;

    update public.importacoes_porto
       set status = 'CONFIRMADA', confirmado_em = now(),
           total_registros = v_importados, registros_novos = v_novos,
           registros_atualizados = v_atualizados, registros_duplicados = v_ignorados,
           valor_total = v_soma
     where id = p_importacao_id;

    return jsonb_build_object(
        'id', p_importacao_id, 'tipo', v_imp.tipo_relatorio,
        'importados', v_importados, 'ignorados', v_ignorados,
        'novos', v_novos, 'atualizados', v_atualizados,
        'receitasCriadas', v_receitas,
        'valorTotal', v_soma,
        'numeroOp', v_op.numero,
        'periodo', v_cal.descricao, 'dataPagamento', v_cal.data_pagamento,
        -- O administrador precisa saber quais OSs ficaram sem socorrista para
        -- vincular a mao: sem motorista nao ha comissao.
        'osSemSocorrista', coalesce((
            select jsonb_agg(jsonb_build_object('id', os.id, 'numero', os.numero)
                             order by os.numero)
            from public.ordens_servico_porto os
            where os.importacao_id = p_importacao_id and os.motorista_id is null), '[]'::jsonb)
    );
end;
$$;

create or replace function public.porto_cancelar_importacao(p_id bigint)
returns public.importacoes_porto
language plpgsql
security definer
set search_path = ''
as $$
declare v public.importacoes_porto;
begin
    perform public.exigir_administrador();
    update public.importacoes_porto set status = 'CANCELADA'
     where id = p_id and status <> 'CONFIRMADA' returning * into v;
    if not found then
        raise exception 'Importação não encontrada ou já confirmada.' using errcode = 'no_data_found';
    end if;
    return v;
end;
$$;

revoke execute on function public.porto_registrar_importacao(text, text, public.tipo_relatorio_porto, integer, text) from public;
revoke execute on function public.porto_confirmar_importacao(bigint, jsonb, text, bigint, text, text, boolean) from public;
revoke execute on function public.porto_cancelar_importacao(bigint) from public;
grant execute on function public.porto_registrar_importacao(text, text, public.tipo_relatorio_porto, integer, text) to authenticated;
grant execute on function public.porto_confirmar_importacao(bigint, jsonb, text, bigint, text, text, boolean) to authenticated;
grant execute on function public.porto_cancelar_importacao(bigint) to authenticated;
