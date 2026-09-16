import { Modal } from './Modal'

/**
 * Confirmacao de saida do sistema.
 *
 * O "Sair" fica na barra de cima, a um clique do avatar e do menu, e encerrava a
 * sessao na hora. Quem errava o alvo perdia o que estava preenchendo e voltava
 * para a tela de login sem ter pedido nada disso. Sair continua sendo um clique
 * — so que agora um clique deliberado.
 *
 * Herda do Modal o Esc, a armadilha de foco e a devolucao do foco ao botao de
 * origem, e o fundo que nao fecha ao clique. O foco entra no × do cabecalho,
 * que cancela: Enter logo depois de abrir nunca desloga ninguem — sair exige
 * chegar ate o botao vermelho.
 */
type Props = {
  nome?: string
  aoCancelar: () => void
  aoConfirmar: () => void
}

export function ConfirmarSaida({ nome, aoCancelar, aoConfirmar }: Props) {
  return <Modal
    etiqueta="Encerrar sessão"
    titulo="Sair do sistema?"
    className="confirmar-saida"
    aoFechar={aoCancelar}>
    <p className="saida-texto">
      {nome ? <>A sessão de <strong>{nome}</strong> será encerrada neste navegador.</> : 'Sua sessão será encerrada neste navegador.'}
      {' '}Formulários abertos com dados ainda não salvos serão perdidos.
    </p>
    <p className="saida-nota">Nada do que já foi salvo se perde. Para voltar, basta entrar de novo.</p>
    <div className="modal-actions">
      <button type="button" className="button button-ghost" onClick={aoCancelar}>Continuar no sistema</button>
      <button type="button" className="button button-danger" onClick={aoConfirmar}>Sair do sistema</button>
    </div>
  </Modal>
}
