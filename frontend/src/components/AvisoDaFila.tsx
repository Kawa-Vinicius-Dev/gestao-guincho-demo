import { useState } from 'react'
import { descartarItem, tentarDeNovo, type ItemDaFila } from '../dados/filaOffline'
import { useFilaOffline } from '../socorrista/useFilaOffline'
import { ConfirmarAcao } from './ConfirmarAcao'

const km = (v?: number) => `${(v ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`

const descrever = (i: ItemDaFila) =>
  i.tipo === 'INICIAR' ? `Início da OS ${i.numeroOs}`
    : i.tipo === 'FOTO_INICIO' ? 'Foto do início do serviço'
      : `Fim de serviço (${km(i.kmFinal)})`

/**
 * O que o socorrista fez sem sinal e ainda nao chegou ao banco. Fica no alto de
 * todas as telas dele: quem toca em "Finalizar" na rua precisa saber, depois, que
 * o toque nao se perdeu — e ver na hora, com a frase do banco, se algum envio foi
 * recusado. Tambem e daqui que a fila e enviada de qualquer tela.
 */
export function AvisoDaFila() {
  const { usuarioId, itens, enviando, enviar } = useFilaOffline()
  const [descartando, setDescartando] = useState<ItemDaFila | null>(null)
  if (!itens.length) return null

  const bloqueado = itens.find(i => i.bloqueio)
  const semSinal = typeof navigator !== 'undefined' && navigator.onLine === false

  if (bloqueado && usuarioId) {
    return <>
      <div className="fila-aviso fila-aviso-erro" role="alert">
        <p><strong>Um envio não passou.</strong> {descrever(bloqueado)}: {bloqueado.bloqueio}</p>
        <p className="fila-aviso-apoio">
          Os envios seguintes esperam este. Corrija o que o aviso pede e tente de novo, ou descarte este envio.
        </p>
        <div className="fila-aviso-acoes">
          <button type="button" className="socorrista-acao-secundaria" onClick={() => void tentarDeNovo(usuarioId, bloqueado.seq as number).then(enviar)}>
            Tentar de novo
          </button>
          <button type="button" className="socorrista-acao-secundaria" onClick={() => setDescartando(bloqueado)}>Descartar</button>
        </div>
      </div>
      {descartando
        ? <ConfirmarAcao
            titulo="Descartar este envio?"
            efeito={`${descrever(descartando)} não será enviado. ${descartando.tipo === 'INICIAR' ? 'O fim deste serviço, se estiver na fila, também sai. ' : ''}Isso não pode ser desfeito.`}
            textoConfirmar="Descartar"
            perigo
            aoConfirmar={() => descartarItem(usuarioId, descartando.seq as number)}
            aoFechar={() => setDescartando(null)}
          />
        : null}
    </>
  }

  return <div className="fila-aviso" role="status">
    <p>
      <strong>{itens.length} {itens.length === 1 ? 'envio guardado' : 'envios guardados'} no celular.</strong>{' '}
      {semSinal ? 'Sem sinal: vão sozinhos quando voltar.' : enviando ? 'Enviando…' : 'Vão sozinhos assim que der.'}
    </p>
    {!semSinal && !enviando
      ? <div className="fila-aviso-acoes">
          <button type="button" className="socorrista-acao-secundaria" onClick={() => void enviar()}>Enviar agora</button>
        </div>
      : null}
  </div>
}
