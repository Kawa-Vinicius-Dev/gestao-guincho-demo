-- Row Level Security.
--
-- Com o Spring no meio, a autorizacao vivia em @PreAuthorize e o banco nunca era
-- exposto. Agora o browser fala direto com o Postgres: a policy e a unica defesa,
-- e uma tabela sem policy e uma tabela aberta. Por isso RLS e ligado em TODAS as
-- tabelas, inclusive nas que so o administrador usa.
--
-- Dois perfis:
--   ADMINISTRADOR — o dono da operacao, ve e mexe em tudo.
--   FUNCIONARIO   — o socorrista. Lanca a propria despesa, ve a propria comissao,
--                   registra quilometragem. Nao ve o caixa, nem despesa de outro.
--
-- Convencoes:
--   * `(select auth.uid())` em vez de `auth.uid()` — o planejador avalia uma vez
--     por consulta em vez de uma vez por linha.
--   * escrita que carrega regra de negocio (aprovar, pagar, receber) nao tem policy
--     de UPDATE: passa por RPC SECURITY DEFINER, onde a regra e verificavel.
--   * `anon` nao recebe nada. Nenhum dado deste sistema e publico.

-- ---------------------------------------------------------------------------
-- Privilegios de tabela
-- ---------------------------------------------------------------------------
-- RLS filtra linhas, GRANT decide se a tabela e alcancavel. Os dois juntos: quem
-- nao fez login nao chega nem a ser filtrado.

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- ---------------------------------------------------------------------------
-- perfis
-- ---------------------------------------------------------------------------

alter table public.perfis enable row level security;
grant select on public.perfis to authenticated;
grant update on public.perfis to authenticated;

-- Cada um se ve; o administrador ve a equipe inteira (tela de usuarios).
create policy perfis_leitura on public.perfis
    for select to authenticated
    using (id = (select auth.uid()) or public.e_administrador());

-- Nao existe policy de auto-edicao de proposito: se um FUNCIONARIO pudesse dar
-- update no proprio registro, poderia escrever perfil = 'ADMINISTRADOR' e se
-- promover. Trocar nome/perfil/ativo e ato de administrador; limpar
-- senha_provisoria e feito pela RPC de troca de senha.
create policy perfis_admin_atualiza on public.perfis
    for update to authenticated
    using (public.e_administrador())
    with check (public.e_administrador());

-- ---------------------------------------------------------------------------
-- Cadastros: todo mundo le, so o administrador escreve
-- ---------------------------------------------------------------------------
-- O socorrista precisa ler veiculos, categorias e motoristas — sao os seletores
-- do formulario de despesa e de quilometragem que ele preenche.

alter table public.veiculos enable row level security;
alter table public.contratantes enable row level security;
alter table public.categorias enable row level security;
alter table public.motoristas enable row level security;

grant select on public.veiculos, public.categorias, public.motoristas to authenticated;
grant select on public.contratantes to authenticated;
grant insert, update, delete on public.veiculos, public.contratantes,
    public.categorias, public.motoristas to authenticated;

create policy veiculos_leitura on public.veiculos
    for select to authenticated using (public.e_operador());
create policy veiculos_escrita on public.veiculos
    for all to authenticated
    using (public.e_administrador()) with check (public.e_administrador());

create policy categorias_leitura on public.categorias
    for select to authenticated using (public.e_operador());
create policy categorias_escrita on public.categorias
    for all to authenticated
    using (public.e_administrador()) with check (public.e_administrador());

create policy motoristas_leitura on public.motoristas
    for select to authenticated using (public.e_operador());
create policy motoristas_escrita on public.motoristas
    for all to authenticated
    using (public.e_administrador()) with check (public.e_administrador());

-- Contratante aparece no caixa, que e tela de administrador.
create policy contratantes_leitura on public.contratantes
    for select to authenticated using (public.e_administrador());
create policy contratantes_escrita on public.contratantes
    for all to authenticated
    using (public.e_administrador()) with check (public.e_administrador());

-- ---------------------------------------------------------------------------
-- despesas
-- ---------------------------------------------------------------------------

alter table public.despesas enable row level security;
grant select, insert on public.despesas to authenticated;
grant update, delete on public.despesas to authenticated;

-- O socorrista ve o que ele mesmo lancou — e so. A tela de despesas e a primeira
-- que ele abre; com "so administrador le", ela abria vazia com erro.
create policy despesas_leitura on public.despesas
    for select to authenticated
    using (public.e_administrador() or criado_por = (select auth.uid()));

-- Lancar e de todo operador ativo. Tres travas no WITH CHECK:
--   criado_por = quem esta chamando  -> ninguem lanca em nome de outro;
--   nao aprovada                     -> ninguem nasce aprovado;
--   sem comprovante                  -> anexo passa pela RPC, que valida tipo e
--                                       tamanho antes de gravar o caminho.
create policy despesas_insercao on public.despesas
    for insert to authenticated
    with check (
        public.e_operador()
        and criado_por = (select auth.uid())
        and not aprovada
        and status = 'PENDENTE'
        and comprovante_arquivo is null
    );

-- Correcao de dados cadastrais da despesa e do administrador. Aprovar, pagar e
-- anexar comprovante nao passam por aqui: sao RPCs, onde a regra e explicita.
create policy despesas_admin_atualiza on public.despesas
    for update to authenticated
    using (public.e_administrador()) with check (public.e_administrador());

create policy despesas_admin_exclui on public.despesas
    for delete to authenticated using (public.e_administrador());

-- ---------------------------------------------------------------------------
-- receitas, contas a receber, despesas fixas: caixa, so administrador
-- ---------------------------------------------------------------------------

alter table public.receitas enable row level security;
alter table public.contas_receber enable row level security;
alter table public.despesas_recorrentes enable row level security;

grant select, insert, update, delete
    on public.receitas, public.contas_receber, public.despesas_recorrentes
    to authenticated;

create policy receitas_leitura on public.receitas
    for select to authenticated using (public.e_administrador());
create policy receitas_insercao on public.receitas
    for insert to authenticated with check (public.e_administrador());

-- Receita vinda da Porto ou de importacao e espelho de um fato externo: editar ou
-- apagar a mao faria o caixa divergir da OP que a originou. A coluna `manual` e
-- gerada, entao nao ha como contornar mudando um campo antes do update.
create policy receitas_atualizacao_manual on public.receitas
    for update to authenticated
    using (public.e_administrador() and manual)
    with check (public.e_administrador() and manual);
create policy receitas_exclusao_manual on public.receitas
    for delete to authenticated
    using (public.e_administrador() and manual);

create policy contas_receber_admin on public.contas_receber
    for all to authenticated
    using (public.e_administrador()) with check (public.e_administrador());

create policy despesas_recorrentes_admin on public.despesas_recorrentes
    for all to authenticated
    using (public.e_administrador()) with check (public.e_administrador());

-- ---------------------------------------------------------------------------
-- quilometragens
-- ---------------------------------------------------------------------------

alter table public.quilometragens enable row level security;
grant select, insert, update, delete on public.quilometragens to authenticated;

-- Quilometragem e registro operacional compartilhado: quem roda precisa ver o que
-- ja foi lancado na viatura para nao lancar em cima.
create policy quilometragens_leitura on public.quilometragens
    for select to authenticated using (public.e_operador());
create policy quilometragens_insercao on public.quilometragens
    for insert to authenticated
    with check (public.e_operador() and criado_por = (select auth.uid()));
create policy quilometragens_admin_corrige on public.quilometragens
    for update to authenticated
    using (public.e_administrador()) with check (public.e_administrador());
create policy quilometragens_admin_exclui on public.quilometragens
    for delete to authenticated using (public.e_administrador());

-- ---------------------------------------------------------------------------
-- Porto
-- ---------------------------------------------------------------------------

alter table public.calendario_pagamentos_porto enable row level security;
alter table public.ordens_pagamento_porto enable row level security;
alter table public.ordens_servico_porto enable row level security;
alter table public.importacoes_porto enable row level security;
alter table public.registros_importados_porto enable row level security;
alter table public.pendencias_porto enable row level security;
alter table public.justificativas_porto enable row level security;
alter table public.historico_porto enable row level security;

grant select on public.calendario_pagamentos_porto, public.ordens_servico_porto to authenticated;
grant insert, update, delete on public.calendario_pagamentos_porto to authenticated;
grant select, insert, update, delete
    on public.ordens_pagamento_porto, public.ordens_servico_porto,
       public.importacoes_porto, public.registros_importados_porto,
       public.pendencias_porto, public.justificativas_porto, public.historico_porto
    to authenticated;

-- O ciclo de pagamento e o seletor de periodo da tela "minha comissao": o
-- socorrista precisa ler para escolher o ciclo.
create policy calendario_porto_leitura on public.calendario_pagamentos_porto
    for select to authenticated using (public.e_operador());
create policy calendario_porto_escrita on public.calendario_pagamentos_porto
    for all to authenticated
    using (public.e_administrador()) with check (public.e_administrador());

-- O socorrista ve as OSs que atendeu — e o detalhe da propria comissao.
create policy oss_porto_leitura on public.ordens_servico_porto
    for select to authenticated
    using (
        public.e_administrador()
        or (motorista_id is not null and motorista_id = public.motorista_atual())
    );
create policy oss_porto_escrita on public.ordens_servico_porto
    for all to authenticated
    using (public.e_administrador()) with check (public.e_administrador());

create policy ops_porto_admin on public.ordens_pagamento_porto
    for all to authenticated
    using (public.e_administrador()) with check (public.e_administrador());
create policy importacoes_porto_admin on public.importacoes_porto
    for all to authenticated
    using (public.e_administrador()) with check (public.e_administrador());
create policy registros_importados_porto_admin on public.registros_importados_porto
    for all to authenticated
    using (public.e_administrador()) with check (public.e_administrador());
create policy pendencias_porto_admin on public.pendencias_porto
    for all to authenticated
    using (public.e_administrador()) with check (public.e_administrador());
create policy justificativas_porto_admin on public.justificativas_porto
    for all to authenticated
    using (public.e_administrador()) with check (public.e_administrador());
create policy historico_porto_admin on public.historico_porto
    for all to authenticated
    using (public.e_administrador()) with check (public.e_administrador());

-- ---------------------------------------------------------------------------
-- pagamentos de comissao
-- ---------------------------------------------------------------------------

alter table public.pagamentos_comissao enable row level security;
grant select, insert, update, delete on public.pagamentos_comissao to authenticated;

-- O socorrista ve o proprio recibo: quanto e quando recebeu.
create policy pagamentos_comissao_leitura on public.pagamentos_comissao
    for select to authenticated
    using (public.e_administrador() or motorista_id = public.motorista_atual());
create policy pagamentos_comissao_escrita on public.pagamentos_comissao
    for all to authenticated
    using (public.e_administrador()) with check (public.e_administrador());

-- ---------------------------------------------------------------------------
-- favoritos do menu
-- ---------------------------------------------------------------------------

alter table public.favoritos_menu enable row level security;
grant select, insert, update, delete on public.favoritos_menu to authenticated;

-- Preferencia pessoal: nem o administrador mexe na barra lateral de outro.
create policy favoritos_menu_proprios on public.favoritos_menu
    for all to authenticated
    using (perfil_id = (select auth.uid()))
    with check (perfil_id = (select auth.uid()));

grant usage on all sequences in schema public to authenticated;
