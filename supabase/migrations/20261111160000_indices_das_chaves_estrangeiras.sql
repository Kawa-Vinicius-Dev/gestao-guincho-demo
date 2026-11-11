-- Indices nas chaves estrangeiras de tabelas ativas que ainda nao tinham um.
--
-- Apontado pelo verificador do proprio Supabase (unindexed_foreign_keys). Sem o
-- indice, apagar ou juntar por essa coluna le a tabela inteira. Hoje as tabelas
-- sao pequenas e nada disso pesa; o indice e barato e evita o dia em que pese.
--
-- So as colunas que aparecem em junção ou filtro de verdade (viatura, socorrista,
-- turno). Ficam de fora as de auditoria (criado_por, aprovado_por, pago_por):
-- ninguem consulta por elas e o indice so custaria escrita.
--
-- if not exists: rodar de novo nao quebra nada, e quem ja criou o indice na mao
-- nao leva erro.
create index if not exists turnos_veiculo_id_idx on public.turnos (veiculo_id);
create index if not exists documentos_veiculo_id_idx on public.documentos (veiculo_id);
create index if not exists documentos_motorista_id_idx on public.documentos (motorista_id);
create index if not exists despesas_recorrentes_veiculo_id_idx on public.despesas_recorrentes (veiculo_id);
create index if not exists despesas_recorrentes_motorista_id_idx on public.despesas_recorrentes (motorista_id);
create index if not exists viatura_danos_turno_id_idx on public.viatura_danos (turno_id);
create index if not exists viatura_danos_motorista_id_idx on public.viatura_danos (motorista_id);
create index if not exists contas_receber_motorista_id_idx on public.contas_receber (motorista_id);
