-- Socorrista sugerido pela escala, corrigido pelo QRA.
--
-- O painel diario nao traz QRA, mas traz a viatura. A tela passa a sugerir o
-- socorrista de uma OS nova pela escala do dia (quem rodou aquela viatura), e
-- manda isso como `motorista_sugerido_id` — palpite, nao escolha. Tres regras:
--
--   1. Escolha feita na tela (`motorista_id`) trava o vinculo, como antes.
--   2. O QRA do relatorio e a identidade oficial da Porto: quando ele casa com
--      um socorrista do cadastro, corrige um vinculo automatico diferente.
--   3. A sugestao da tela e a escala do banco so preenchem quem ainda nao tem dono.
--
-- E o nome: o painel corta o nome pela largura da coluna ("QEBSON RAMOS DA
-- SILV"). Ele nao substitui mais o nome completo que veio da OP.
do $$
declare v_def text; v_antes text; v_depois text;
begin
    select pg_get_functiondef('public.porto_confirmar_importacao'::regproc) into v_def;

    v_antes := 'v_os_qra text; v_os_sigla text; v_os_devolucao date;';
    if position(v_antes in v_def) = 0 then raise exception 'declaracoes nao encontradas'; end if;
    v_def := replace(v_def, v_antes, v_antes || '
    v_sugerido bigint;');

    v_antes := '            elsif v_os_motorista is null and not v_os_manual then
                update public.ordens_servico_porto
                   set motorista_id = coalesce(
                       (select m.id from public.motoristas m
                         where v_os_qra is not null and m.qra is not null
                           and upper(btrim(m.qra)) = upper(btrim(v_os_qra)) limit 1),
                       (select max(outra.motorista_id)
                          from public.ordens_servico_porto outra
                         where v_os_sigla is not null
                           and outra.motorista_id is not null
                           and outra.id <> v_os_id
                           and upper(btrim(outra.sigla_viatura)) = upper(btrim(v_os_sigla))
                           and outra.data_atendimento = (
                               select data_atendimento from public.ordens_servico_porto
                                where id = v_os_id)
                        having count(distinct outra.motorista_id) = 1))
                 where id = v_os_id
                returning motorista_id into v_os_motorista;
            end if;';
    v_depois := '            elsif not v_os_manual then
                v_sugerido := coalesce(
                    -- O QRA identifica a pessoa: vale mesmo sobre um vinculo automatico.
                    (select m.id from public.motoristas m
                      where v_os_qra is not null and m.qra is not null
                        and upper(btrim(m.qra)) = upper(btrim(v_os_qra)) limit 1),
                    -- Palpites so preenchem quem ainda nao tem dono.
                    case when v_os_motorista is null
                         then nullif(v_linha ->> ''motorista_sugerido_id'', '''')::bigint end,
                    case when v_os_motorista is null then
                        (select max(outra.motorista_id)
                           from public.ordens_servico_porto outra
                          where v_os_sigla is not null
                            and outra.motorista_id is not null
                            and outra.id <> v_os_id
                            and upper(btrim(outra.sigla_viatura)) = upper(btrim(v_os_sigla))
                            and outra.data_atendimento = (
                                select data_atendimento from public.ordens_servico_porto
                                 where id = v_os_id)
                         having count(distinct outra.motorista_id) = 1) end);
                if v_sugerido is not null and v_sugerido is distinct from v_os_motorista then
                    update public.ordens_servico_porto
                       set motorista_id = v_sugerido
                     where id = v_os_id
                    returning motorista_id into v_os_motorista;
                end if;
            end if;';
    if position(v_antes in v_def) = 0 then raise exception 'bloco do socorrista nao encontrado'; end if;
    v_def := replace(v_def, v_antes, v_depois);

    v_antes := 'socorrista = coalesce(excluded.socorrista, public.ordens_servico_porto.socorrista),';
    v_depois := 'socorrista = case
                       when length(coalesce(public.ordens_servico_porto.socorrista, ''''))
                            > length(coalesce(excluded.socorrista, ''''))
                       then public.ordens_servico_porto.socorrista
                       else coalesce(excluded.socorrista, public.ordens_servico_porto.socorrista) end,';
    if position(v_antes in v_def) = 0 then raise exception 'nome do socorrista nao encontrado'; end if;

    execute replace(v_def, v_antes, v_depois);
end $$;
