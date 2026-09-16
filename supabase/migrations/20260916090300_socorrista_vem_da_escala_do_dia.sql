-- Quem atendeu a OS, quando o QRA nao resolve.
--
-- O palpite anterior era a viatura habitual do cadastro: "o L25 e do Qebson".
-- Mas as viaturas trocam de socorrista, entao esse palpite acerta numa semana e
-- erra na outra — e o que ele decide e de quem e a comissao. Errar caladamente
-- ali e pior do que nao adivinhar.
--
-- A resposta certa ja esta no sistema: o painel do dia registra viatura e
-- socorrista juntos, servico a servico. Entao a pergunta passa a ser "quem
-- rodou o L25 no dia 14/04?" — a escala daquele dia, e nao um costume.
--
-- O `having` sem `group by` e o que torna a sugestao segura: ele vale sobre o
-- conjunto inteiro, entao ou uma pessoa so rodou aquela viatura naquele dia, ou
-- nao ha sugestao e a tela de importacao pergunta antes de gravar. Entre dois
-- donos possiveis o sistema nao escolhe.
--
-- A mesma regra vive no frontend, em `cadastroDeSocorristas`, que monta a
-- sugestao da previa. As duas precisam continuar iguais.
do $$
declare v_def text; v_antes text; v_depois text;
begin
    select pg_get_functiondef(p.oid) into v_def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'porto_confirmar_importacao';

    v_antes := '(select m.id from public.motoristas m
                         join public.veiculos ve on ve.id = m.veiculo_id
                        where v_os_sigla is not null and ve.sigla_porto is not null
                          and upper(btrim(ve.sigla_porto)) = upper(btrim(v_os_sigla)) limit 1)';

    v_depois := '(select max(outra.motorista_id)
                          from public.ordens_servico_porto outra
                         where v_os_sigla is not null
                           and outra.motorista_id is not null
                           and outra.id <> v_os_id
                           and upper(btrim(outra.sigla_viatura)) = upper(btrim(v_os_sigla))
                           and outra.data_atendimento = (
                               select data_atendimento from public.ordens_servico_porto
                                where id = v_os_id)
                        having count(distinct outra.motorista_id) = 1)';

    if position(v_antes in v_def) = 0 then
        raise exception 'palpite por viatura habitual nao encontrado na funcao';
    end if;

    execute replace(v_def, v_antes, v_depois);
end $$;
