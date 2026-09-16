-- A OP define o proprio periodo, e chega paga.
--
-- Antes o recorte vinha do calendario de pagamento, cadastrado a mao: a
-- importacao exigia escolher um ciclo, e era a data desse ciclo que entrava no
-- caixa. Na pratica o ciclo ja esta dentro do arquivo — uma OP contem as OS de
-- um intervalo, e sao elas que dizem qual. Cadastrar de novo o que o arquivo ja
-- informa e trabalho que so cria oportunidade de errar.
--
-- E toda OP chega paga: o relatorio so e emitido depois do pagamento, entao
-- "confirmar recebimento" era um passo que nunca dizia nao.

alter table public.ordens_pagamento_porto
    add column if not exists periodo_inicio date,
    add column if not exists periodo_fim date;

comment on column public.ordens_pagamento_porto.periodo_inicio is
    'Primeira data de atendimento entre as OS da OP. Calculada na importacao.';
comment on column public.ordens_pagamento_porto.periodo_fim is
    'Ultima data de atendimento entre as OS da OP. E o recorte do dashboard.';

create index if not exists ops_porto_periodo_idx
    on public.ordens_pagamento_porto (periodo_fim, periodo_inicio);

-- O recorte do caixa e o fim do periodo da OP, nao a data em que o dinheiro
-- caiu na conta. Uma OP com servicos de 30/03 a 29/04 pode ser paga em 07/06;
-- contar a receita pela data do pagamento jogaria o faturamento de abril para
-- junho, e um filtro de abril mostraria zero — embora os servicos, a producao e
-- a comissao sejam todos de abril.
create or replace function public.porto_fechar_op(p_op_id bigint)
returns public.ordens_pagamento_porto
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_op public.ordens_pagamento_porto;
    v_inicio date; v_fim date; v_soma numeric; v_ref date;
begin
    select min(data_atendimento), max(data_atendimento), coalesce(sum(valor_total), 0)
      into v_inicio, v_fim, v_soma
      from public.ordens_servico_porto
     where ordem_pagamento_id = p_op_id;

    update public.ordens_pagamento_porto
       set valor_total = v_soma,
           periodo_inicio = v_inicio,
           periodo_fim = v_fim,
           data_pagamento_programada = coalesce(data_pagamento_programada, v_fim, current_date),
           data_recebimento = coalesce(data_recebimento, v_fim, current_date),
           valor_recebido = coalesce(valor_recebido, v_soma),
           situacao_financeira = 'RECEBIDO'
     where id = p_op_id
    returning * into v_op;

    -- Sem OS com data — OP cadastrada a mao, por exemplo — sobra a data
    -- programada, e por ultimo hoje: a coluna nao aceita nulo.
    v_ref := coalesce(v_op.periodo_fim, v_op.data_pagamento_programada, current_date);

    update public.ordens_servico_porto
       set status_financeiro = 'RECEBIDO',
           data_efetiva_pagamento = v_ref
     where ordem_pagamento_id = p_op_id
       and status_operacional <> 'CANCELADO';

    update public.contas_receber
       set data_competencia = v_ref, vencimento = v_ref, data_recebimento = v_ref
     where ordem_pagamento_porto_id = p_op_id;

    update public.receitas
       set data_competencia = v_ref, data_recebimento = v_ref
     where ordem_pagamento_porto_id = p_op_id;

    return v_op;
end;
$$;

revoke execute on function public.porto_fechar_op(bigint) from public, anon;
grant execute on function public.porto_fechar_op(bigint) to authenticated;

-- Quatro emendas cirurgicas na importacao, cada uma conferida antes de aplicar.
-- Reescrever as duzentas e tantas linhas da funcao inteira so para mudar estes
-- trechos criaria duas versoes para manter em sincronia.
do $$
declare
    v_def text;
    v_antes text; v_depois text;
    v_emendas text[][] := array[
        -- 1. O ciclo deixa de ser obrigatorio: se nao houver, segue sem ele.
        array[
            'if not found then
            raise exception ''Informe o ciclo de pagamento.'' using errcode = ''invalid_parameter_value'';
        end if;',
            ''
        ],
        -- 2. Divergencia entre a soma do arquivo e o valor da OP vira aviso na
        --    conciliacao, nao um formulario a preencher antes de importar.
        array[
            'if v_op.valor_total <> 0 and abs(v_diferenca) > 0.01
           and (not coalesce(p_confirmar_divergencias, false)
                or p_motivo_divergencia is null
                or coalesce(btrim(p_justificativa), '''') = '''') then
            raise exception ''A soma do arquivo diverge do valor da OP; confirme a divergência e informe motivo e justificativa.''
                using errcode = ''invalid_parameter_value'';
        end if;',
            ''
        ],
        -- 3. Sem ciclo, a data do lancamento nasce da propria OS. E provisoria:
        --    `porto_fechar_op` reescreve tudo para o fim do periodo da OP no
        --    final desta mesma transacao.
        array[
            'v_cal.data_pagamento, v_cal.data_pagamento, v_cal.data_pagamento,',
            'coalesce(v_cal.data_pagamento, nullif(v_linha ->> ''data_atendimento'', '''')::date, current_date),
                    coalesce(v_cal.data_pagamento, nullif(v_linha ->> ''data_atendimento'', '''')::date, current_date),
                    coalesce(v_cal.data_pagamento, nullif(v_linha ->> ''data_atendimento'', '''')::date, current_date),'
        ],
        array[
            '''OS '' || v_os_numero, v_os_valor, v_cal.data_pagamento,
                    v_cal.data_pagamento, ''RECEBIDA'', v_contratante, v_categoria,',
            '''OS '' || v_os_numero, v_os_valor,
                    coalesce(v_cal.data_pagamento, nullif(v_linha ->> ''data_atendimento'', '''')::date, current_date),
                    coalesce(v_cal.data_pagamento, nullif(v_linha ->> ''data_atendimento'', '''')::date, current_date),
                    ''RECEBIDA'', v_contratante, v_categoria,'
        ],
        -- 4. O fechamento da OP — periodo, valor, recebimento e o caixa que
        --    nasceu dela — passa a ser um so lugar.
        array[
            'update public.ordens_pagamento_porto
           set valor_total = coalesce((select sum(valor_total) from public.ordens_servico_porto
                                        where ordem_pagamento_id = v_op.id), 0),
               calendario_pagamento_id = v_cal.id,
               data_pagamento_programada = coalesce(data_pagamento_programada, v_cal.data_pagamento),
               importacao_id = coalesce(importacao_id, p_importacao_id)
         where id = v_op.id;',
            'update public.ordens_pagamento_porto
           set calendario_pagamento_id = coalesce(v_cal.id, calendario_pagamento_id),
               importacao_id = coalesce(importacao_id, p_importacao_id)
         where id = v_op.id;

        perform public.porto_fechar_op(v_op.id);
        select * into v_op from public.ordens_pagamento_porto where id = v_op.id;'
        ]
    ];
    i int;
begin
    select pg_get_functiondef(p.oid) into v_def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'porto_confirmar_importacao';

    for i in 1 .. array_length(v_emendas, 1) loop
        v_antes := v_emendas[i][1];
        v_depois := v_emendas[i][2];
        if position(v_antes in v_def) = 0 then
            raise exception 'emenda % nao encontrada na funcao', i;
        end if;
        v_def := replace(v_def, v_antes, v_depois);
    end loop;

    execute v_def;
end $$;

-- A tela pode mandar o socorrista junto com a linha.
--
-- Ate aqui o vinculo era so adivinhacao do banco: QRA, e depois a viatura
-- habitual. Quando nenhum dos dois casa, a OS entrava sem dono — e OS sem dono
-- e comissao que ninguem recebe, com o servico ja contado no faturamento. Agora
-- quem importa resolve as orfas na propria previa, e a escolha chega aqui.
-- Escolha humana e sempre manual: a proxima importacao nao desfaz.
do $$
declare v_def text; v_antes text; v_depois text;
begin
    select pg_get_functiondef(p.oid) into v_def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'porto_confirmar_importacao';

    v_antes := 'if v_os_motorista is null and not v_os_manual then';
    v_depois := 'if nullif(v_linha ->> ''motorista_id'', '''') is not null then
                update public.ordens_servico_porto
                   set motorista_id = (v_linha ->> ''motorista_id'')::bigint,
                       motorista_vinculo_manual = true
                 where id = v_os_id
                returning motorista_id into v_os_motorista;
            elsif v_os_motorista is null and not v_os_manual then';

    if position(v_antes in v_def) = 0 then
        raise exception 'bloco de vinculo do socorrista nao encontrado';
    end if;

    execute replace(v_def, v_antes, v_depois);
end $$;
