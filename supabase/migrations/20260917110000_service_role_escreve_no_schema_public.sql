-- A Edge Function admin-usuarios usa a service_role para ligar a conta nova ao
-- socorrista (motoristas.perfil_id) e marcar senha provisoria (perfis). O schema
-- public foi criado sem conceder nada a service_role, entao o update falhava com
-- "permission denied", a funcao desfazia a conta e a tela ficava sem resposta.
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;
