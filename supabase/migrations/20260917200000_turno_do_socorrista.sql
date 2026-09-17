-- Turno do socorrista: o odometro vira km oficial passando pelo administrador.
--
-- O socorrista APONTA, o administrador CONFIRMA. Por isso o turno e uma tabela
-- propria e nao um insert direto em `quilometragens`: enquanto esta pendente, o
-- numero que ele digitou nao e km da empresa, nao entra no custo do km morto e
-- nao encosta em comissao. So a aprovacao cria a linha em `quilometragens` — a
-- tela de frota do administrador continua exatamente como esta, e ele segue
-- podendo lancar km a mao para o que nao veio de turno.
--
-- Ninguem digita "rodei 180 km": grava-se o odometro da abertura e o do
-- fechamento, e o km rodado e coluna gerada. Um numero que o sistema calcula nao
-- pode divergir dos dois que o originaram.

create type public.situacao_turno as enum (
    'ABERTO', 'AGUARDANDO_APROVACAO', 'APROVADO', 'DEVOLVIDO'
);

create table public.turnos (
    id bigint generated always as identity primary key,
    motorista_id bigint not null references public.motoristas (id) on delete restrict,
    -- A viatura e escolhida na abertura (o app sugere a ultima): trocar de carro
    -- e rotina, e a viatura errada no fechamento estraga o hodometro dos dois.
    veiculo_id bigint not null references public.veiculos (id) on delete restrict,
    data_turno date not null,
    situacao public.situacao_turno not null default 'ABERTO',

    aberto_em timestamptz not null default now(),
    hodometro_inicial numeric(12, 2) not null,
    -- Foto do painel. Opcional na abertura, obrigatoria no fechamento: e o
    -- fechamento que fixa o km rodado, entao e ele que precisa de prova.
    foto_abertura text,

    fechado_em timestamptz,
    hodometro_final numeric(12, 2),
    foto_fechamento text,

    observacoes text,
    devolucao_motivo text,

    -- A linha de km que a aprovacao gerou. Guardar o vinculo permite desfazer e
    -- impede aprovar duas vezes o mesmo turno.
    quilometragem_id bigint references public.quilometragens (id) on delete set null,
    aprovado_por uuid references public.perfis (id) on delete set null,
    aprovado_em timestamptz,

    criado_por uuid not null references public.perfis (id) on delete restrict,
    criado_em timestamptz not null default now(),
    atualizado_em timestamptz not null default now(),

    constraint turnos_hodometro_inicial_nao_negativo check (hodometro_inicial >= 0),
    constraint turnos_hodometro_coerente check (
        hodometro_final is null or hodometro_final >= hodometro_inicial
    ),
    -- Turno fechado tem os tres: hora, odometro e foto. A foto de fechamento e
    -- exigida aqui, e nao so na tela, porque a tela nao e o unico caminho ate a
    -- tabela.
    constraint turnos_fechamento_completo check (
        situacao = 'ABERTO'
        or (fechado_em is not null and hodometro_final is not null
            and foto_fechamento is not null)
    ),
    constraint turnos_aprovado_tem_autor check (
        (situacao = 'APROVADO') = (aprovado_por is not null and aprovado_em is not null)
    ),
    constraint turnos_aprovado_tem_km check (
        situacao <> 'APROVADO' or quilometragem_id is not null
    ),
    constraint turnos_devolvido_tem_motivo check (
        situacao <> 'DEVOLVIDO' or length(btrim(coalesce(devolucao_motivo, ''))) > 0
    )
);

-- Um turno aberto por socorrista. Se ele esqueceu de fechar ontem, o app cobra o
-- fechamento daquele antes de deixar abrir outro — fechar sozinho a meia-noite
-- geraria turno sem odometro final, que e o mesmo que turno sem km.
create unique index turnos_um_aberto_por_socorrista
    on public.turnos (motorista_id)
    where situacao = 'ABERTO';

create index turnos_por_situacao on public.turnos (situacao, data_turno desc);
create index turnos_por_motorista on public.turnos (motorista_id, data_turno desc);

create trigger turnos_atualizado_em before update on public.turnos
    for each row execute function public.tocar_atualizado_em();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
--
-- Leitura: o socorrista ve so os turnos dele. Diferente de `quilometragens`, que
-- e registro operacional compartilhado, o turno carrega foto e observacao de uma
-- pessoa — e ele nao tem nada que ver o turno do colega.
--
-- Escrita: nenhuma. Abrir, fechar, aprovar e devolver passam pelas RPCs abaixo.
-- Sem insert/update direto, nao ha como um UPDATE cru marcar situacao =
-- 'APROVADO' e pular o administrador.

alter table public.turnos enable row level security;
grant select on public.turnos to authenticated;

create policy turnos_leitura on public.turnos
    for select to authenticated
    using (
        public.e_administrador()
        or motorista_id = public.motorista_atual()
    );

-- ---------------------------------------------------------------------------
-- Quem esta apontando
-- ---------------------------------------------------------------------------

create or replace function public.exigir_socorrista()
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_id bigint;
begin
    if not public.e_operador() then
        raise exception 'Sessao invalida.' using errcode = 'insufficient_privilege';
    end if;

    v_id := public.motorista_atual();
    if v_id is null then
        raise exception 'Sua conta nao esta ligada a um socorrista. Fale com a administracao.'
            using errcode = 'insufficient_privilege';
    end if;
    return v_id;
end;
$$;

comment on function public.exigir_socorrista() is
    'Id do socorrista de quem chama; erra se a conta nao estiver vinculada.';

-- ---------------------------------------------------------------------------
-- A tela do celular: tudo que o turno do dia precisa, numa chamada so
-- ---------------------------------------------------------------------------
--
-- Uma chamada porque a tela abre na rua, em rede ruim: tres requisicoes em
-- sequencia sao tres chances de a tela aparecer pela metade.

create or replace function public.meu_turno_do_dia()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_motorista bigint := public.exigir_socorrista();
    v jsonb;
begin
    select jsonb_build_object(
        'socorrista', (
            select jsonb_build_object('id', m.id, 'nome', m.nome, 'qra', m.qra)
            from public.motoristas m where m.id = v_motorista),
        'hoje', current_date,
        -- Turno em andamento. Pode ser de ontem: quem virou a noite fecha o
        -- turno de ontem, nao abre um de hoje por cima.
        'turnoAberto', (
            select jsonb_build_object(
                'id', t.id, 'data', t.data_turno, 'abertoEm', t.aberto_em,
                'veiculoId', t.veiculo_id, 'veiculo', v2.identificacao,
                'hodometroInicial', t.hodometro_inicial,
                'temFotoAbertura', t.foto_abertura is not null,
                'deDiaAnterior', t.data_turno < current_date,
                'observacoes', t.observacoes)
            from public.turnos t
            join public.veiculos v2 on v2.id = t.veiculo_id
            where t.motorista_id = v_motorista and t.situacao = 'ABERTO'),
        -- Devolvido pelo administrador: e o unico caso em que ele reabre algo ja
        -- fechado, e a tela precisa dizer o motivo.
        'turnosDevolvidos', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', t.id, 'data', t.data_turno, 'veiculo', v2.identificacao,
                'hodometroInicial', t.hodometro_inicial,
                'hodometroFinal', t.hodometro_final,
                'motivo', t.devolucao_motivo) order by t.data_turno desc)
            from public.turnos t
            join public.veiculos v2 on v2.id = t.veiculo_id
            where t.motorista_id = v_motorista and t.situacao = 'DEVOLVIDO'), '[]'::jsonb),
        'ultimosTurnos', coalesce((
            select jsonb_agg(x) from (
                select jsonb_build_object(
                    'id', t.id, 'data', t.data_turno, 'veiculo', v2.identificacao,
                    'situacao', t.situacao,
                    'kmRodado', t.hodometro_final - t.hodometro_inicial) as x
                from public.turnos t
                join public.veiculos v2 on v2.id = t.veiculo_id
                where t.motorista_id = v_motorista and t.situacao <> 'ABERTO'
                order by t.data_turno desc, t.id desc
                limit 10) s), '[]'::jsonb),
        'viaturas', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', v2.id, 'identificacao', v2.identificacao,
                -- Ultimo odometro conhecido da viatura: o app mostra como
                -- referencia para quem digita errado perceber na hora.
                'ultimoHodometro', (
                    select max(q.hodometro_final) from public.quilometragens q
                    where q.veiculo_id = v2.id))
                order by v2.identificacao)
            from public.veiculos v2 where v2.ativo), '[]'::jsonb),
        -- A viatura da ultima vez ja vem marcada: um toque no caso normal.
        'veiculoSugerido', (
            select t.veiculo_id from public.turnos t
            where t.motorista_id = v_motorista
            order by t.aberto_em desc limit 1)
    ) into v;
    return v;
end;
$$;

revoke execute on function public.meu_turno_do_dia() from public;
grant execute on function public.meu_turno_do_dia() to authenticated;

-- ---------------------------------------------------------------------------
-- Abrir, fotografar e fechar
-- ---------------------------------------------------------------------------

create or replace function public.abrir_turno(
    p_veiculo_id bigint,
    p_hodometro numeric,
    p_observacoes text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_motorista bigint := public.exigir_socorrista();
    v_id bigint;
    v_ultimo numeric;
begin
    if exists (select 1 from public.turnos t
               where t.motorista_id = v_motorista and t.situacao = 'ABERTO') then
        raise exception 'Voce ja tem um turno aberto. Feche o turno anterior primeiro.'
            using errcode = 'invalid_parameter_value';
    end if;

    if not exists (select 1 from public.veiculos v where v.id = p_veiculo_id and v.ativo) then
        raise exception 'Viatura invalida.' using errcode = 'invalid_parameter_value';
    end if;

    if p_hodometro is null or p_hodometro < 0 then
        raise exception 'Informe o odometro da viatura.'
            using errcode = 'invalid_parameter_value';
    end if;

    -- Odometro que anda para tras e quase sempre digito trocado. Nao bloqueia:
    -- viatura trocada de painel existe. Fica registrado para o administrador ver
    -- na hora de aprovar.
    select max(q.hodometro_final) into v_ultimo
    from public.quilometragens q where q.veiculo_id = p_veiculo_id;

    insert into public.turnos (
        motorista_id, veiculo_id, data_turno, hodometro_inicial,
        observacoes, criado_por
    ) values (
        v_motorista, p_veiculo_id, current_date, p_hodometro,
        nullif(btrim(coalesce(p_observacoes, '')), ''), (select auth.uid())
    ) returning id into v_id;

    return v_id;
end;
$$;

revoke execute on function public.abrir_turno(bigint, numeric, text) from public;
grant execute on function public.abrir_turno(bigint, numeric, text) to authenticated;

-- A foto sobe depois do turno existir (o caminho carrega o id). Esta funcao so
-- registra o caminho, e so do proprio turno aberto.
create or replace function public.registrar_foto_abertura(
    p_turno_id bigint, p_caminho text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_motorista bigint := public.exigir_socorrista();
begin
    update public.turnos
       set foto_abertura = p_caminho
     where id = p_turno_id
       and motorista_id = v_motorista
       and situacao = 'ABERTO';

    if not found then
        raise exception 'Turno nao encontrado ou ja fechado.'
            using errcode = 'invalid_parameter_value';
    end if;
end;
$$;

revoke execute on function public.registrar_foto_abertura(bigint, text) from public;
grant execute on function public.registrar_foto_abertura(bigint, text) to authenticated;

-- Fechar vale para o turno aberto e para o que voltou devolvido: corrigir o que
-- o administrador recusou e o mesmo gesto, com os mesmos dois campos.
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
begin
    select t.hodometro_inicial into v_inicial
    from public.turnos t
    where t.id = p_turno_id
      and t.motorista_id = v_motorista
      and t.situacao in ('ABERTO', 'DEVOLVIDO');

    if not found then
        raise exception 'Turno nao encontrado.' using errcode = 'invalid_parameter_value';
    end if;

    if p_hodometro is null then
        raise exception 'Informe o odometro de fechamento.'
            using errcode = 'invalid_parameter_value';
    end if;

    if p_hodometro < v_inicial then
        raise exception 'O odometro de fechamento (%) e menor que o de abertura (%).'
            , p_hodometro, v_inicial using errcode = 'invalid_parameter_value';
    end if;

    -- Foto do painel no fechamento e obrigatoria: e ela que sustenta o km que
    -- vai virar custo da empresa.
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

revoke execute on function public.fechar_turno(bigint, numeric, text, text) from public;
grant execute on function public.fechar_turno(bigint, numeric, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- A fila do administrador
-- ---------------------------------------------------------------------------
--
-- Uma fila so, com turno e despesa lado a lado, cada linha dizendo de qual
-- socorrista veio. Sao duas tabelas diferentes, mas para quem aprova e um
-- assunto so: "o que chegou de quem trabalha na rua e ainda depende de mim".

create or replace function public.fila_de_aprovacoes(
    p_inicio date default null, p_fim date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_ini date := coalesce(p_inicio, current_date - 60);
    v_fim date := coalesce(p_fim, current_date);
    v jsonb;
begin
    perform public.exigir_administrador();

    select jsonb_build_object(
        'itens', coalesce((
            select jsonb_agg(x order by (x->>'data') desc, (x->>'id')) from (
                select jsonb_build_object(
                    'tipo', 'TURNO', 'id', t.id, 'data', t.data_turno,
                    'socorristaId', m.id, 'socorrista', m.nome, 'qra', m.qra,
                    'veiculoId', t.veiculo_id, 'veiculo', v2.identificacao,
                    'hodometroInicial', t.hodometro_inicial,
                    'hodometroFinal', t.hodometro_final,
                    'kmRodado', t.hodometro_final - t.hodometro_inicial,
                    'custoPorKm', v2.custo_por_km,
                    'fotoAbertura', t.foto_abertura,
                    'fotoFechamento', t.foto_fechamento,
                    'observacoes', t.observacoes,
                    'abertoEm', t.aberto_em, 'fechadoEm', t.fechado_em,
                    -- Serve de referencia na hora de informar o km produtivo: as
                    -- OS daquele dia sao o que a viatura rodou a servico.
                    'osNoDia', (
                        select count(*) from public.ordens_servico_porto os
                        where os.motorista_id = m.id
                          and os.data_atendimento = t.data_turno)) as x
                from public.turnos t
                join public.motoristas m on m.id = t.motorista_id
                join public.veiculos v2 on v2.id = t.veiculo_id
                where t.situacao = 'AGUARDANDO_APROVACAO'
                  and t.data_turno between v_ini and v_fim
                union all
                select jsonb_build_object(
                    'tipo', 'DESPESA', 'id', d.id, 'data', d.data_lancamento,
                    'socorristaId', m.id, 'socorrista', m.nome, 'qra', m.qra,
                    'descricao', d.descricao, 'valor', d.valor,
                    'categoria', c.nome,
                    'veiculo', v3.identificacao,
                    'comprovante', d.comprovante_arquivo,
                    'descontaDaComissao', d.natureza = 'ALIMENTACAO_FUNCIONARIO',
                    'observacoes', d.observacoes) as x
                from public.despesas d
                join public.motoristas m on m.id = d.motorista_id
                join public.categorias c on c.id = d.categoria_id
                left join public.veiculos v3 on v3.id = d.veiculo_id
                where not d.aprovada
                  and d.status = 'PENDENTE'
                  and d.data_lancamento between v_ini and v_fim
            ) s), '[]'::jsonb),
        -- Turno de dia passado ainda aberto: o socorrista esqueceu de fechar.
        -- Nao e aprovavel — e cobranca, e por isso vem separado.
        'turnosNaoFechados', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', t.id, 'data', t.data_turno,
                'socorristaId', m.id, 'socorrista', m.nome,
                'veiculo', v2.identificacao,
                'hodometroInicial', t.hodometro_inicial,
                'diasEmAberto', current_date - t.data_turno)
                order by t.data_turno)
            from public.turnos t
            join public.motoristas m on m.id = t.motorista_id
            join public.veiculos v2 on v2.id = t.veiculo_id
            where t.situacao = 'ABERTO' and t.data_turno < current_date), '[]'::jsonb)
    ) into v;
    return v;
end;
$$;

revoke execute on function public.fila_de_aprovacoes(date, date) from public;
grant execute on function public.fila_de_aprovacoes(date, date) to authenticated;

-- Aprovar e o momento em que o apontamento vira km da empresa: a linha em
-- `quilometragens` nasce aqui, com o custo do km congelado do veiculo, como toda
-- quilometragem lancada a mao.
--
-- O km produtivo e informado por quem aprova. Nao da para deduzir das OS: a OS
-- da Porto nao traz km rodado, so valor. Enquanto nao houver OS em tempo real, o
-- km morto continua sendo "rodado menos o que o administrador reconhece".
create or replace function public.aprovar_turno(
    p_turno_id bigint,
    p_km_remunerado numeric default 0,
    p_observacoes text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
    t public.turnos;
    v_custo numeric(12, 4);
    v_km_id bigint;
begin
    perform public.exigir_administrador();

    select * into t from public.turnos
    where id = p_turno_id and situacao = 'AGUARDANDO_APROVACAO';

    if not found then
        raise exception 'Turno nao encontrado ou ja tratado.'
            using errcode = 'invalid_parameter_value';
    end if;

    if coalesce(p_km_remunerado, 0) < 0 then
        raise exception 'O km produtivo nao pode ser negativo.'
            using errcode = 'invalid_parameter_value';
    end if;

    if coalesce(p_km_remunerado, 0) > (t.hodometro_final - t.hodometro_inicial) then
        raise exception 'O km produtivo (%) excede o km rodado no turno (%).'
            , p_km_remunerado, t.hodometro_final - t.hodometro_inicial
            using errcode = 'invalid_parameter_value';
    end if;

    select v.custo_por_km into v_custo from public.veiculos v where v.id = t.veiculo_id;

    insert into public.quilometragens (
        data_registro, veiculo_id, motorista_id,
        hodometro_inicial, hodometro_final, km_remunerado, custo_por_km,
        observacoes, criado_por
    ) values (
        t.data_turno, t.veiculo_id, t.motorista_id,
        t.hodometro_inicial, t.hodometro_final, coalesce(p_km_remunerado, 0),
        coalesce(v_custo, 0),
        nullif(btrim(coalesce(p_observacoes, concat('Turno #', t.id))), ''),
        (select auth.uid())
    ) returning id into v_km_id;

    update public.turnos
       set situacao = 'APROVADO',
           quilometragem_id = v_km_id,
           aprovado_por = (select auth.uid()),
           aprovado_em = now(),
           devolucao_motivo = null
     where id = p_turno_id;

    return v_km_id;
end;
$$;

revoke execute on function public.aprovar_turno(bigint, numeric, text) from public;
grant execute on function public.aprovar_turno(bigint, numeric, text) to authenticated;

create or replace function public.devolver_turno(p_turno_id bigint, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    perform public.exigir_administrador();

    if length(btrim(coalesce(p_motivo, ''))) = 0 then
        raise exception 'Diga o motivo da devolucao: e o que o socorrista vai ler.'
            using errcode = 'invalid_parameter_value';
    end if;

    update public.turnos
       set situacao = 'DEVOLVIDO', devolucao_motivo = btrim(p_motivo)
     where id = p_turno_id and situacao = 'AGUARDANDO_APROVACAO';

    if not found then
        raise exception 'Turno nao encontrado ou ja tratado.'
            using errcode = 'invalid_parameter_value';
    end if;
end;
$$;

revoke execute on function public.devolver_turno(bigint, text) from public;
grant execute on function public.devolver_turno(bigint, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: as fotos do odometro
-- ---------------------------------------------------------------------------
--
-- Convencao de caminho, no mesmo bucket privado dos comprovantes:
--   turnos/<id_do_turno>/<arquivo>

create or replace function public.turno_do_caminho(p_caminho text)
returns bigint
language sql
immutable
set search_path = ''
as $$
    select case
        when p_caminho like 'turnos/%'
             and split_part(p_caminho, '/', 2) ~ '^[0-9]+$'
        then split_part(p_caminho, '/', 2)::bigint
    end
$$;

create policy turnos_fotos_leitura on storage.objects
    for select to authenticated
    using (
        bucket_id = 'comprovantes'
        and name like 'turnos/%'
        and (
            public.e_administrador()
            or exists (
                select 1 from public.turnos t
                where t.id = public.turno_do_caminho(name)
                  and t.motorista_id = public.motorista_atual()
            )
        )
    );

-- Enviar so no proprio turno e so enquanto ele depende do socorrista: turno ja
-- aprovado nao recebe foto nova, senao a prova mudaria depois da decisao.
create policy turnos_fotos_envio on storage.objects
    for insert to authenticated
    with check (
        bucket_id = 'comprovantes'
        and name like 'turnos/%'
        and public.e_operador()
        and exists (
            select 1 from public.turnos t
            where t.id = public.turno_do_caminho(name)
              and t.motorista_id = public.motorista_atual()
              and t.situacao in ('ABERTO', 'DEVOLVIDO')
        )
    );
