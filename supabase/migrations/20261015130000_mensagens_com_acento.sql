-- Mensagens de erro do banco em portugues correto (Kawa, 15/10/2026).
--
-- O texto do `raise exception` chega cru na tela, e varias funcoes antigas
-- escreviam sem acento ("Sessao invalida", "Informe o odometro de fechamento").
-- Aqui so o texto muda: cada funcao e relida do proprio banco
-- (pg_get_functiondef), a mensagem entre aspas e trocada pela nova e a funcao e
-- recriada igual. Nenhuma condicao, codigo de erro ou permissao muda.
--
-- Idempotente: depois da troca o texto antigo nao existe mais, entao rodar de
-- novo nao encontra nada para trocar.

do $mensagens$
declare
    v_trocas text[][] := array[
        ['A comissao desta OP ja foi paga a este socorrista.', 'A comissão desta OP já foi paga a este socorrista.'],
        ['A comissao deste ciclo ja foi paga a este socorrista.', 'A comissão deste período já foi paga a este socorrista.'],
        ['A foto do odometro e obrigatoria para fechar o turno.', 'Tire a foto do painel para fechar o turno.'],
        ['Acesso restrito ao administrador.', 'Só o administrador pode fazer isso.'],
        ['Arquivo fora da pasta do atendimento.', 'Este arquivo não é deste atendimento. Envie de novo.'],
        ['Caminho do arquivo ausente.', 'O arquivo não foi enviado. Tente de novo.'],
        ['Conta cancelada nao pode ser recebida.', 'Esta conta foi cancelada e não pode ser recebida.'],
        ['Conta ja recebida.', 'Esta conta já foi recebida.'],
        ['Conta nao encontrada.', 'Conta não encontrada.'],
        ['Danos invalidos.', 'Os danos não foram preenchidos direito. Confira e envie de novo.'],
        ['Despesa ja paga nao pode ser rejeitada.', 'Esta despesa já foi paga e não pode ser recusada.'],
        ['Despesa ja paga.', 'Esta despesa já foi paga.'],
        ['Despesa nao encontrada.', 'Despesa não encontrada. Ela pode ter sido excluída.'],
        ['Despesa precisa ser aprovada antes de ser paga.', 'Aprove a despesa antes de registrar o pagamento.'],
        ['Despesa rejeitada nao pode ser aprovada.', 'Esta despesa foi recusada e não pode ser aprovada.'],
        ['Diga o motivo da devolucao: e o que o socorrista vai ler.', 'Escreva o motivo da devolução: é o que o socorrista vai ler.'],
        ['Diga onde e o dano.', 'Diga onde é o dano.'],
        ['Envie a foto do painel da saida antes de fechar o turno.', 'Envie a foto do painel da saída antes de fechar o turno.'],
        ['Foto de dano invalida.', 'A foto do dano não chegou. Tire a foto de novo.'],
        ['Informe o ciclo de pagamento.', 'Escolha o período.'],
        ['Informe o odometro da viatura.', 'Informe a quilometragem da viatura.'],
        ['Informe o odometro de fechamento.', 'Informe a quilometragem da chegada.'],
        ['Informe o valor da alimentacao.', 'Informe o valor da alimentação.'],
        ['Nao ha valor liquido positivo de comissao para pagar nesta OP.', 'Não há comissão a pagar nesta OP.'],
        ['Nao ha valor liquido positivo de comissao para pagar neste periodo.', 'Não há comissão a pagar neste período.'],
        ['Ninguem rejeita o proprio lancamento.', 'Você não pode recusar uma despesa que você mesmo lançou.'],
        ['O km produtivo (%) excede o km rodado no turno (%).', 'O km produtivo (%) é maior que o km rodado no turno (%).'],
        ['O km produtivo nao pode ser negativo.', 'O km produtivo não pode ser negativo.'],
        ['O km remunerado excede o rodado. Confirme para registrar assim mesmo.', 'O km em serviço é maior que o km rodado. Confirme para registrar assim mesmo.'],
        ['O odometro de fechamento (%) e menor que o de abertura (%).', 'A quilometragem da chegada (%) é menor que a da saída (%). Confira o painel.'],
        ['OP nao encontrada.', 'OP não encontrada.'],
        ['Ordem de pagamento nao encontrada.', 'OP não encontrada.'],
        ['Ordem de servico nao encontrada.', 'OS não encontrada.'],
        ['Sessao invalida.', 'Não foi possível confirmar seu acesso. Entre de novo no sistema.'],
        ['Seu usuario ainda nao esta vinculado a um socorrista.', 'Sua conta ainda não está ligada a um socorrista. Fale com o administrador.'],
        ['Socorrista nao encontrado.', 'Socorrista não encontrado.'],
        ['Sua conta nao esta ligada a um socorrista. Fale com a administracao.', 'Sua conta não está ligada a um socorrista. Fale com o administrador.'],
        ['Turno nao encontrado ou ja fechado.', 'Turno não encontrado ou já fechado.'],
        ['Turno nao encontrado ou ja tratado.', 'Este turno não está mais aguardando aprovação.'],
        ['Turno nao encontrado.', 'Turno não encontrado.'],
        ['Valor negativo na OS %.', 'A OS % está com valor negativo. Confira o arquivo.'],
        ['Viatura invalida.', 'Viatura não encontrada. Escolha outra.'],
        ['Voce ja tem um turno aberto. Feche o turno anterior primeiro.', 'Você já tem um turno aberto. Feche esse turno antes de abrir outro.'],
        ['Voce so pode anexar comprovante as despesas que lancou.', 'Você só pode anexar comprovante às despesas que você lançou.'],
        ['Voce so pode consultar a propria comissao.', 'Você só pode consultar a sua própria comissão.'],
        ['Voce so pode remover o comprovante das despesas que lancou.', 'Você só pode remover o comprovante das despesas que você lançou.']
    ];
    v_funcao record;
    v_def text;
    v_nova text;
    i integer;
begin
    for v_funcao in
        select p.oid from pg_proc p
         where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
           and p.prosrc like '%raise exception%'
    loop
        v_def := pg_get_functiondef(v_funcao.oid);
        v_nova := v_def;
        for i in 1 .. array_length(v_trocas, 1) loop
            -- So a mensagem inteira, entre aspas: nada fora do texto e tocado.
            v_nova := replace(v_nova, quote_literal(v_trocas[i][1]), quote_literal(v_trocas[i][2]));
        end loop;
        if v_nova <> v_def then
            execute v_nova;
        end if;
    end loop;
end
$mensagens$;
