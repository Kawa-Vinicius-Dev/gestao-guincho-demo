-- Quilometragem deixa de ser leitura compartilhada entre socorristas.
--
-- A policy original liberava a tabela inteira a qualquer operador, com um motivo
-- que fazia sentido quando o km era digitado a mao: quem ia lancar precisava ver
-- o que ja tinha sido lancado na viatura para nao lancar em cima. Com o turno,
-- esse risco acabou — o odometro vem da abertura e do fechamento, e o proprio
-- turno impede dois registros do mesmo dia.
--
-- O que sobrava era um socorrista lendo o km, o custo do km morto e a viatura de
-- todos os colegas. Kawa ja fixou que ele nao ve dinheiro nem numero dos outros;
-- esta policy era a ultima porta aberta nisso.
--
-- O administrador continua vendo tudo, e o ultimo odometro da viatura, que a
-- tela de abrir turno mostra como referencia, sai de `meu_turno_do_dia`, que e
-- SECURITY DEFINER — nao depende desta policy.

drop policy if exists quilometragens_leitura on public.quilometragens;

create policy quilometragens_leitura on public.quilometragens
    for select to authenticated
    using (
        public.e_administrador()
        or motorista_id = public.motorista_atual()
    );
