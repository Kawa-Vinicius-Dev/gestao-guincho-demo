-- RLS: as funcoes de identidade passam a ser avaliadas uma vez por consulta.
--
-- Medido num Postgres com dois anos de operacao (9.600 OSs):
--
--     sem RLS ............................  0,72 ms
--     com as policies como estavam ....... 206,90 ms
--     com as policies deste arquivo ......   1,87 ms
--
-- O motivo: `e_administrador()` e `motorista_atual()` sao STABLE, mas escritas
-- soltas dentro do USING elas entram no filtro da varredura e o planejador as
-- chama UMA VEZ POR LINHA. Envolvidas numa subconsulta escalar, `(select f())`,
-- viram InitPlan: o Postgres calcula antes de varrer e compara com o resultado.
-- O plano deixa de mostrar `Filter: (e_administrador() OR ...)` e passa a
-- mostrar `Filter: ($0 OR ...)`.
--
-- E o mesmo motivo pelo qual `auth.uid()` ja estava escrito como
-- `(select auth.uid())` desde o inicio; o que faltou foi aplicar a regra as
-- funcoes proprias.
--
-- Segundo ajuste: as policies de escrita eram `for all`, que inclui SELECT.
-- Convivendo com a policy de leitura, as duas eram somadas em toda leitura e o
-- filtro ficava `(e_operador() OR e_administrador())` — duas chamadas por linha
-- para responder uma pergunta so. Agora cada operacao tem a sua.
--
-- Nenhuma regra de acesso muda. Quem podia o que continua igual; o que muda e
-- quantas vezes o banco pergunta.

-- ---------------------------------------------------------------------------
-- perfis
-- ---------------------------------------------------------------------------
drop policy if exists perfis_leitura on public.perfis;
drop policy if exists perfis_admin_atualiza on public.perfis;

create policy perfis_leitura on public.perfis
    for select to authenticated
    using (id = (select auth.uid()) or (select public.e_administrador()));

create policy perfis_admin_atualiza on public.perfis
    for update to authenticated
    using ((select public.e_administrador()))
    with check ((select public.e_administrador()));

-- ---------------------------------------------------------------------------
-- Cadastros
-- ---------------------------------------------------------------------------
drop policy if exists veiculos_leitura on public.veiculos;
drop policy if exists veiculos_escrita on public.veiculos;
create policy veiculos_leitura on public.veiculos
    for select to authenticated using ((select public.e_operador()));
create policy veiculos_insercao on public.veiculos
    for insert to authenticated with check ((select public.e_administrador()));
create policy veiculos_atualizacao on public.veiculos
    for update to authenticated
    using ((select public.e_administrador())) with check ((select public.e_administrador()));
create policy veiculos_exclusao on public.veiculos
    for delete to authenticated using ((select public.e_administrador()));

drop policy if exists categorias_leitura on public.categorias;
drop policy if exists categorias_escrita on public.categorias;
create policy categorias_leitura on public.categorias
    for select to authenticated using ((select public.e_operador()));
create policy categorias_insercao on public.categorias
    for insert to authenticated with check ((select public.e_administrador()));
create policy categorias_atualizacao on public.categorias
    for update to authenticated
    using ((select public.e_administrador())) with check ((select public.e_administrador()));
create policy categorias_exclusao on public.categorias
    for delete to authenticated using ((select public.e_administrador()));

drop policy if exists motoristas_leitura on public.motoristas;
drop policy if exists motoristas_escrita on public.motoristas;
create policy motoristas_leitura on public.motoristas
    for select to authenticated using ((select public.e_operador()));
create policy motoristas_insercao on public.motoristas
    for insert to authenticated with check ((select public.e_administrador()));
create policy motoristas_atualizacao on public.motoristas
    for update to authenticated
    using ((select public.e_administrador())) with check ((select public.e_administrador()));
create policy motoristas_exclusao on public.motoristas
    for delete to authenticated using ((select public.e_administrador()));

drop policy if exists contratantes_leitura on public.contratantes;
drop policy if exists contratantes_escrita on public.contratantes;
create policy contratantes_leitura on public.contratantes
    for select to authenticated using ((select public.e_administrador()));
create policy contratantes_insercao on public.contratantes
    for insert to authenticated with check ((select public.e_administrador()));
create policy contratantes_atualizacao on public.contratantes
    for update to authenticated
    using ((select public.e_administrador())) with check ((select public.e_administrador()));
create policy contratantes_exclusao on public.contratantes
    for delete to authenticated using ((select public.e_administrador()));

-- ---------------------------------------------------------------------------
-- despesas: ja tinha uma policy por operacao; falta so a avaliacao unica.
-- ---------------------------------------------------------------------------
drop policy if exists despesas_leitura on public.despesas;
drop policy if exists despesas_insercao on public.despesas;
drop policy if exists despesas_admin_atualiza on public.despesas;
drop policy if exists despesas_admin_exclui on public.despesas;

create policy despesas_leitura on public.despesas
    for select to authenticated
    using ((select public.e_administrador()) or criado_por = (select auth.uid()));
create policy despesas_insercao on public.despesas
    for insert to authenticated
    with check (
        (select public.e_operador())
        and criado_por = (select auth.uid())
        and not aprovada
        and status = 'PENDENTE'
        and comprovante_arquivo is null
    );
create policy despesas_admin_atualiza on public.despesas
    for update to authenticated
    using ((select public.e_administrador())) with check ((select public.e_administrador()));
create policy despesas_admin_exclui on public.despesas
    for delete to authenticated using ((select public.e_administrador()));

-- ---------------------------------------------------------------------------
-- receitas, contas a receber, despesas fixas
-- ---------------------------------------------------------------------------
drop policy if exists receitas_leitura on public.receitas;
drop policy if exists receitas_insercao on public.receitas;
drop policy if exists receitas_atualizacao_manual on public.receitas;
drop policy if exists receitas_exclusao_manual on public.receitas;

create policy receitas_leitura on public.receitas
    for select to authenticated using ((select public.e_administrador()));
create policy receitas_insercao on public.receitas
    for insert to authenticated with check ((select public.e_administrador()));
create policy receitas_atualizacao_manual on public.receitas
    for update to authenticated
    using ((select public.e_administrador()) and manual)
    with check ((select public.e_administrador()) and manual);
create policy receitas_exclusao_manual on public.receitas
    for delete to authenticated
    using ((select public.e_administrador()) and manual);

drop policy if exists contas_receber_admin on public.contas_receber;
create policy contas_receber_leitura on public.contas_receber
    for select to authenticated using ((select public.e_administrador()));
create policy contas_receber_insercao on public.contas_receber
    for insert to authenticated with check ((select public.e_administrador()));
create policy contas_receber_atualizacao on public.contas_receber
    for update to authenticated
    using ((select public.e_administrador())) with check ((select public.e_administrador()));
create policy contas_receber_exclusao on public.contas_receber
    for delete to authenticated using ((select public.e_administrador()));

drop policy if exists despesas_recorrentes_admin on public.despesas_recorrentes;
create policy despesas_recorrentes_leitura on public.despesas_recorrentes
    for select to authenticated using ((select public.e_administrador()));
create policy despesas_recorrentes_insercao on public.despesas_recorrentes
    for insert to authenticated with check ((select public.e_administrador()));
create policy despesas_recorrentes_atualizacao on public.despesas_recorrentes
    for update to authenticated
    using ((select public.e_administrador())) with check ((select public.e_administrador()));
create policy despesas_recorrentes_exclusao on public.despesas_recorrentes
    for delete to authenticated using ((select public.e_administrador()));

-- ---------------------------------------------------------------------------
-- quilometragens
-- ---------------------------------------------------------------------------
drop policy if exists quilometragens_leitura on public.quilometragens;
drop policy if exists quilometragens_insercao on public.quilometragens;
drop policy if exists quilometragens_admin_corrige on public.quilometragens;
drop policy if exists quilometragens_admin_exclui on public.quilometragens;

create policy quilometragens_leitura on public.quilometragens
    for select to authenticated using ((select public.e_operador()));
create policy quilometragens_insercao on public.quilometragens
    for insert to authenticated
    with check ((select public.e_operador()) and criado_por = (select auth.uid()));
create policy quilometragens_admin_corrige on public.quilometragens
    for update to authenticated
    using ((select public.e_administrador())) with check ((select public.e_administrador()));
create policy quilometragens_admin_exclui on public.quilometragens
    for delete to authenticated using ((select public.e_administrador()));

-- ---------------------------------------------------------------------------
-- Porto
-- ---------------------------------------------------------------------------
drop policy if exists calendario_porto_leitura on public.calendario_pagamentos_porto;
drop policy if exists calendario_porto_escrita on public.calendario_pagamentos_porto;
create policy calendario_porto_leitura on public.calendario_pagamentos_porto
    for select to authenticated using ((select public.e_operador()));
create policy calendario_porto_insercao on public.calendario_pagamentos_porto
    for insert to authenticated with check ((select public.e_administrador()));
create policy calendario_porto_atualizacao on public.calendario_pagamentos_porto
    for update to authenticated
    using ((select public.e_administrador())) with check ((select public.e_administrador()));
create policy calendario_porto_exclusao on public.calendario_pagamentos_porto
    for delete to authenticated using ((select public.e_administrador()));

drop policy if exists oss_porto_leitura on public.ordens_servico_porto;
drop policy if exists oss_porto_escrita on public.ordens_servico_porto;
drop policy if exists oss_porto_insercao on public.ordens_servico_porto;
drop policy if exists oss_porto_atualizacao on public.ordens_servico_porto;
drop policy if exists oss_porto_exclusao on public.ordens_servico_porto;
create policy oss_porto_leitura on public.ordens_servico_porto
    for select to authenticated
    using (
        (select public.e_administrador())
        or (motorista_id is not null and motorista_id = (select public.motorista_atual()))
    );
create policy oss_porto_insercao on public.ordens_servico_porto
    for insert to authenticated with check ((select public.e_administrador()));
create policy oss_porto_atualizacao on public.ordens_servico_porto
    for update to authenticated
    using ((select public.e_administrador())) with check ((select public.e_administrador()));
create policy oss_porto_exclusao on public.ordens_servico_porto
    for delete to authenticated using ((select public.e_administrador()));

-- As demais tabelas do Porto sao so de administrador: uma policy por operacao,
-- com a mesma avaliacao unica.
do $$
declare t text;
begin
    foreach t in array array[
        'ordens_pagamento_porto', 'importacoes_porto', 'registros_importados_porto',
        'pendencias_porto', 'justificativas_porto', 'historico_porto'
    ] loop
        execute format('drop policy if exists %I on public.%I', t || '_admin', t);
        execute format($f$create policy %I on public.%I for select to authenticated
                          using ((select public.e_administrador()))$f$, t || '_leitura', t);
        execute format($f$create policy %I on public.%I for insert to authenticated
                          with check ((select public.e_administrador()))$f$, t || '_insercao', t);
        execute format($f$create policy %I on public.%I for update to authenticated
                          using ((select public.e_administrador()))
                          with check ((select public.e_administrador()))$f$, t || '_atualizacao', t);
        execute format($f$create policy %I on public.%I for delete to authenticated
                          using ((select public.e_administrador()))$f$, t || '_exclusao', t);
    end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Comissoes
-- ---------------------------------------------------------------------------
drop policy if exists pagamentos_comissao_leitura on public.pagamentos_comissao;
drop policy if exists pagamentos_comissao_escrita on public.pagamentos_comissao;
create policy pagamentos_comissao_leitura on public.pagamentos_comissao
    for select to authenticated
    using ((select public.e_administrador()) or motorista_id = (select public.motorista_atual()));
create policy pagamentos_comissao_insercao on public.pagamentos_comissao
    for insert to authenticated with check ((select public.e_administrador()));
create policy pagamentos_comissao_atualizacao on public.pagamentos_comissao
    for update to authenticated
    using ((select public.e_administrador())) with check ((select public.e_administrador()));
create policy pagamentos_comissao_exclusao on public.pagamentos_comissao
    for delete to authenticated using ((select public.e_administrador()));

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------
drop policy if exists comprovantes_leitura on storage.objects;
drop policy if exists comprovantes_envio on storage.objects;
drop policy if exists comprovantes_remocao on storage.objects;
drop policy if exists porto_arquivos_admin on storage.objects;

create policy comprovantes_leitura on storage.objects
    for select to authenticated
    using (
        bucket_id = 'comprovantes'
        and (
            (select public.e_administrador())
            or exists (
                select 1 from public.despesas d
                where d.id = public.despesa_do_caminho(name)
                  and d.criado_por = (select auth.uid())
            )
        )
    );

create policy comprovantes_envio on storage.objects
    for insert to authenticated
    with check (
        bucket_id = 'comprovantes'
        and (select public.e_operador())
        and (
            (select public.e_administrador())
            or exists (
                select 1 from public.despesas d
                where d.id = public.despesa_do_caminho(name)
                  and d.criado_por = (select auth.uid())
            )
        )
    );

create policy comprovantes_remocao on storage.objects
    for delete to authenticated
    using (
        bucket_id = 'comprovantes'
        and (
            (select public.e_administrador())
            or exists (
                select 1 from public.despesas d
                where d.id = public.despesa_do_caminho(name)
                  and d.criado_por = (select auth.uid())
            )
        )
    );

create policy porto_arquivos_leitura on storage.objects
    for select to authenticated
    using (bucket_id = 'importacoes-porto' and (select public.e_administrador()));
create policy porto_arquivos_envio on storage.objects
    for insert to authenticated
    with check (bucket_id = 'importacoes-porto' and (select public.e_administrador()));
create policy porto_arquivos_remocao on storage.objects
    for delete to authenticated
    using (bucket_id = 'importacoes-porto' and (select public.e_administrador()));
