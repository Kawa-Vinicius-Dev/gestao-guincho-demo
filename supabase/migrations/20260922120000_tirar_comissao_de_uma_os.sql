-- Tirar a comissao de uma OS, mesmo depois de ela ter entrado numa OP.
--
-- Kawa, 22/09/2026: acontece de uma OS cair no nome de um socorrista e nao
-- caber comissao nela — nao era dele, ou foi um servico que nao gera. Ate aqui
-- a unica saida era tirar o socorrista da OS, o que apaga quem rodou o servico
-- para acertar o dinheiro. Duas informacoes diferentes na mesma coluna.
--
-- Agora e uma marca propria: `sem_comissao`. O socorrista continua na OS, o
-- servico continua contando na producao dele e no faturamento da viatura, e so
-- a comissao sai. Vale para OS que ja esta paga numa OP: a comissao daquela OP
-- e refeita na hora e o liquido dele baixa, que e o efeito que se quer quando o
-- erro so foi percebido depois.

alter table public.ordens_servico_porto
    add column if not exists sem_comissao boolean not null default false;
comment on column public.ordens_servico_porto.sem_comissao is
    'OS que nao gera comissao para o socorrista. Producao e faturamento continuam contando.';

-- ------------------------------------------------------------------ ajudante
-- A cirurgia de texto em pg_get_functiondef e o padrao daqui, e ela falha em
-- silencio quando a ancora muda: `replace` sem correspondencia devolve o texto
-- igual e a migration passa sem ter feito nada. Este ajudante recusa. Ele vive
-- so durante esta migration — pg_temp nao serve, porque quem aplica a migration
-- pode nao ser a mesma sessao.
create or replace function public.__trocar_no_corpo(v_def text, v_antes text, v_depois text, v_onde text)
returns text language plpgsql as $$
begin
    if position(v_antes in v_def) = 0 then
        raise exception 'Ancora nao encontrada em %: %', v_onde, left(v_antes, 60);
    end if;
    return replace(v_def, v_antes, v_depois);
end $$;

do $migracao$
declare v_def text;
begin
    -- 1. A despesa de comissao: a OS marcada sai da soma que vira dinheiro.
    v_def := pg_get_functiondef('public.porto_sincronizar_comissoes()'::regprocedure);
    v_def := public.__trocar_no_corpo(v_def,
        E'where os.motorista_id is not null\n              and os.status_operacional <> ''CANCELADO''',
        E'where os.motorista_id is not null\n              and os.status_operacional <> ''CANCELADO''\n              and not os.sem_comissao',
        'porto_sincronizar_comissoes');
    execute v_def;

    -- 2. A leitura da comissao do periodo. A OS marcada continua na lista e na
    --    producao — some so a comissao dela, que passa a ser zero.
    v_def := pg_get_functiondef('public.comissao_das_ops(bigint[], bigint)'::regprocedure);
    v_def := public.__trocar_no_corpo(v_def,
        'os.valor_total, round(os.valor_total * v_pct, 2) as comissao_servico',
        E'os.valor_total, os.sem_comissao,\n               case when os.sem_comissao then 0 else round(os.valor_total * v_pct, 2) end as comissao_servico',
        'comissao_das_ops (servicos)');
    -- Com uma OS isenta no meio, a comissao bruta deixa de ser 20% da producao:
    -- passa a ser a soma do que cada servico gerou.
    v_def := public.__trocar_no_corpo(v_def,
        '''comissaoBruta'', round(s.producao * v_pct, 2)',
        '''comissaoBruta'', s.comissao_bruta',
        'comissao_das_ops (comissaoBruta)');
    v_def := public.__trocar_no_corpo(v_def,
        '''liquido'', round(s.producao * v_pct, 2) - s.descontos',
        '''liquido'', s.comissao_bruta - s.descontos',
        'comissao_das_ops (liquido)');
    v_def := public.__trocar_no_corpo(v_def,
        'coalesce((select sum(valor_total) from servicos), 0) as producao,',
        E'coalesce((select sum(valor_total) from servicos), 0) as producao,\n               coalesce((select sum(comissao_servico) from servicos), 0) as comissao_bruta,',
        'comissao_das_ops (somas)');
    execute v_def;

    -- 3. A ficha do socorrista: a coluna "Comissao gerada" da tela de onde o
    --    administrador tira a comissao. Ela precisa mostrar zero no mesmo
    --    instante, senao o botao parece nao ter funcionado.
    v_def := pg_get_functiondef('public.detalhe_socorrista_ops(bigint, bigint[])'::regprocedure);
    v_def := public.__trocar_no_corpo(v_def,
        E'''comissaoGerada'', case when os.status_financeiro = ''RECEBIDO''\n                    then round(os.valor_total * v_pct, 2) end)',
        E'''semComissao'', os.sem_comissao,\n                ''comissaoGerada'', case when os.sem_comissao then 0\n                    when os.status_financeiro = ''RECEBIDO''\n                    then round(os.valor_total * v_pct, 2) end)',
        'detalhe_socorrista_ops');
    execute v_def;

    -- 4. O previsto da competencia, que e o que ainda nao entrou em OP.
    v_def := pg_get_functiondef('public.porto_comissao_prevista(date, date, bigint)'::regprocedure);
    if position('sem_comissao' in v_def) = 0 then
        v_def := public.__trocar_no_corpo(v_def,
            'os.status_operacional <> ''CANCELADO''',
            'os.status_operacional <> ''CANCELADO'' and not os.sem_comissao',
            'porto_comissao_prevista');
        execute v_def;
    end if;
end
$migracao$;

drop function public.__trocar_no_corpo(text, text, text, text);

-- ------------------------------------------------------------------ escrita
-- Tirar e devolver a comissao e do administrador, e a comissao se refaz na
-- mesma transacao: a tela nao pode mostrar o botao alternado com o dinheiro
-- ainda velho.
create or replace function public.porto_definir_comissao_da_os(
    p_os_id bigint,
    p_sem_comissao boolean
)
returns public.ordens_servico_porto
language plpgsql
security definer
set search_path = ''
as $$
declare v_os public.ordens_servico_porto;
begin
    perform public.exigir_administrador();

    update public.ordens_servico_porto
       set sem_comissao = coalesce(p_sem_comissao, false),
           atualizado_em = now()
     where id = p_os_id
    returning * into v_os;

    if not found then
        raise exception 'Ordem de servico nao encontrada.' using errcode = 'no_data_found';
    end if;

    perform public.porto_sincronizar_comissoes();
    return v_os;
end;
$$;

revoke execute on function public.porto_definir_comissao_da_os(bigint, boolean) from public, anon;
grant execute on function public.porto_definir_comissao_da_os(bigint, boolean) to authenticated;
