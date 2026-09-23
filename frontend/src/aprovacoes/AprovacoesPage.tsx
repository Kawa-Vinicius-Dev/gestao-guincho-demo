import { useCallback, useEffect, useState } from 'react'
import { LinkSocorrista, LinkViatura } from '../components/LinksDeDado'
import { ConfirmarAcao } from '../components/ConfirmarAcao'
import { Carregando, ErroPagina, Vazio } from '../components/EstadoPagina'
import { Modal } from '../components/Modal'
import { CabecalhoPagina, Painel } from '../components/ui/Pagina'
import { aprovarDespesa, excluirDespesa } from '../dados/despesas'
import { ConfirmarExclusao } from '../components/ConfirmarExclusao'
import type { Despesa } from '../types/modelos'
import {
  aprovarTurno, devolverTurno, filaDeAprovacoes, linkDaFoto,
  type FilaDeAprovacoes, type ItemDaFila,
} from '../dados/turnos'

/**
 * Aprovações — a fila única do administrador.
 *
 * Turno e despesa chegam de tabelas diferentes, mas para quem aprova sao o mesmo
 * assunto: o que veio de quem trabalha na rua e ainda depende de uma decisao.
 * Estavam em duas telas, e conferir o dia exigia passar nas duas.
 *
 * Toda linha diz de qual socorrista veio, no proprio texto — nao num filtro
 * acima nem numa coluna que some quando a tabela rola.
 *
 * Nada e aprovado em lote: cada aprovacao vira dinheiro ou km da empresa, e o
 * gesto que faz isso precisa ser individual e confirmado.
 */

const dinheiro = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const numero = new Intl.NumberFormat('pt-BR')

function dataCurta(iso: string) {
  return new Date(`${iso}T12:00`).toLocaleDateString('pt-BR')
}

function VerFoto({ caminho, rotulo }: { caminho: string; rotulo: string }) {
  const [url, setUrl] = useState('')
  const [erro, setErro] = useState('')
  return <>
    <button type="button" className="button button-ghost button-sm"
      onClick={() => linkDaFoto(caminho).then(setUrl).catch(e => setErro((e as Error).message))}>
      {rotulo}
    </button>
    {erro ? <span className="form-alert">{erro}</span> : null}
    {url
      ? <Modal etiqueta="Comprovação" titulo={rotulo} fecharAoClicarFora aoFechar={() => setUrl('')}>
          <img src={url} alt={rotulo} className="aprovacoes-foto" />
        </Modal>
      : null}
  </>
}

function LinhaTurno({ item, aoResolver }: { item: ItemDaFila; aoResolver: () => void }) {
  const rodado = item.kmRodado ?? 0
  const [kmProdutivo, setKmProdutivo] = useState('0')
  const [confirmar, setConfirmar] = useState(false)
  const [devolvendo, setDevolvendo] = useState(false)
  const [motivo, setMotivo] = useState('')

  const produtivo = Number(kmProdutivo || 0)
  const morto = rodado - produtivo
  const custo = (item.custoPorKm ?? 0) * Math.max(morto, 0)

  return <article className="aprovacao-item">
    <header>
      <span className="aprovacao-tipo aprovacao-tipo-turno">Turno</span>
      <h3><LinkSocorrista id={item.socorristaId} nome={item.socorrista}/>{item.qra ? <small> · QRA {item.qra}</small> : null}</h3>
      <span className="aprovacao-data">{dataCurta(item.data)} · <LinkViatura id={item.veiculoId} sigla={item.veiculo}/></span>
    </header>

    <dl className="aprovacao-numeros">
      <div><dt>Odômetro saída</dt><dd>{numero.format(item.hodometroInicial ?? 0)}</dd></div>
      <div><dt>Odômetro chegada</dt><dd>{numero.format(item.hodometroFinal ?? 0)}</dd></div>
      <div><dt>Km rodado</dt><dd className="aprovacao-destaque">{numero.format(rodado)} km</dd></div>
      <div><dt>OS no dia</dt><dd>{item.osNoDia ?? 0}</dd></div>
    </dl>

    <div className="aprovacao-km">
      <label htmlFor={`km-${item.id}`}>Km produtivo reconhecido</label>
      <input id={`km-${item.id}`} type="text" inputMode="numeric" value={kmProdutivo}
        onChange={e => setKmProdutivo(e.target.value.replace(/[^\d]/g, ''))} />
      <p className="aprovacao-apoio">
        Km morto: <strong>{numero.format(Math.max(morto, 0))} km</strong>
        {item.custoPorKm ? <> · custo {dinheiro.format(custo)}</> : null}
      </p>
    </div>

    {item.observacoes ? <p className="aprovacao-observacao">“{item.observacoes}”</p> : null}

    <footer className="aprovacao-acoes">
      {item.fotoAbertura ? <VerFoto caminho={item.fotoAbertura} rotulo="Foto da saída" /> : null}
      {item.fotoFechamento ? <VerFoto caminho={item.fotoFechamento} rotulo="Foto da chegada" /> : null}
      <button type="button" className="button button-ghost" onClick={() => setDevolvendo(true)}>
        Devolver
      </button>
      <button type="button" className="button button-primary"
        disabled={produtivo > rodado}
        onClick={() => setConfirmar(true)}>
        Aprovar
      </button>
    </footer>

    {confirmar
      ? <ConfirmarAcao
          titulo="Aprovar o turno?"
          efeito="O km rodado entra no sistema como quilometragem da empresa, com o custo do km morto calculado. Isso não pode ser desfeito por aqui."
          resumo={[
            ['Socorrista', item.socorrista],
            ['Viatura', item.veiculo ?? '—'],
            ['Km rodado', `${numero.format(rodado)} km`],
            ['Km produtivo', `${numero.format(produtivo)} km`],
            ['Km morto', `${numero.format(Math.max(morto, 0))} km`],
          ]}
          avisos={[produtivo === 0 && rodado > 0
            ? 'Sem km produtivo informado, o turno inteiro vira km morto.' : null]}
          textoConfirmar="Aprovar turno"
          aoConfirmar={async () => { await aprovarTurno(item.id, produtivo); aoResolver() }}
          aoFechar={() => setConfirmar(false)}
        />
      : null}

    {devolvendo
      ? <Modal etiqueta="Devolver" titulo="Devolver o turno ao socorrista"
          fecharAoClicarFora aoFechar={() => setDevolvendo(false)}>
          <p className="saida-texto">
            O turno volta para {item.socorrista} corrigir. Ele vai ler o motivo no celular.
          </p>
          <label className="field">
            <span>Motivo</span>
            <textarea rows={3} value={motivo} onChange={e => setMotivo(e.target.value)}
              placeholder="Ex.: a foto não mostra o odômetro" />
          </label>
          <div className="modal-actions">
            <button type="button" className="button button-ghost"
              onClick={() => setDevolvendo(false)}>Voltar</button>
            <button type="button" className="button button-danger" disabled={!motivo.trim()}
              onClick={async () => {
                await devolverTurno(item.id, motivo.trim())
                setDevolvendo(false); aoResolver()
              }}>Devolver turno</button>
          </div>
        </Modal>
      : null}
  </article>
}

function LinhaDespesa({ item, aoResolver }: { item: ItemDaFila; aoResolver: () => void }) {
  const [confirmar, setConfirmar] = useState(false)
  const [excluindo, setExcluindo] = useState(false)
  return <article className="aprovacao-item">
    <header>
      <span className="aprovacao-tipo aprovacao-tipo-despesa">Despesa</span>
      <h3><LinkSocorrista id={item.socorristaId} nome={item.socorrista}/>{item.qra ? <small> · QRA {item.qra}</small> : null}</h3>
      <span className="aprovacao-data">{dataCurta(item.data)}{item.veiculo ? <> · <LinkViatura id={item.veiculoId} sigla={item.veiculo}/></> : null}</span>
    </header>

    <dl className="aprovacao-numeros">
      <div><dt>Descrição</dt><dd>{item.descricao}</dd></div>
      <div><dt>Categoria</dt><dd>{item.categoria}</dd></div>
      <div><dt>Valor</dt><dd className="aprovacao-destaque">{dinheiro.format(item.valor ?? 0)}</dd></div>
      <div><dt>Desconta da comissão</dt><dd>{item.descontaDaComissao ? 'Sim' : 'Não'}</dd></div>
    </dl>

    {item.observacoes ? <p className="aprovacao-observacao">“{item.observacoes}”</p> : null}

    <footer className="aprovacao-acoes">
      {item.comprovante ? <VerFoto caminho={item.comprovante} rotulo="Ver comprovante" /> : null}
      <button type="button" className="button button-ghost" onClick={() => setExcluindo(true)}>
        Excluir
      </button>
      <button type="button" className="button button-primary" onClick={() => setConfirmar(true)}>
        Aprovar
      </button>
    </footer>

    {excluindo
      ? <ConfirmarExclusao coisa="despesa" nome={item.descricao ?? 'despesa'}
          aviso={`A despesa lançada por ${item.socorrista} sai do sistema, com o comprovante. Não dá para desfazer.`}
          resumo={[
            ['Socorrista', item.socorrista],
            ['Descrição', item.descricao ?? '—'],
            ['Valor', dinheiro.format(item.valor ?? 0)],
          ]}
          aoConfirmar={async () => {
            await excluirDespesa({ id: item.id, comprovante: item.comprovante ?? undefined } as Despesa)
            aoResolver()
          }}
          aoFechar={() => setExcluindo(false)}/>
      : null}

    {confirmar
      ? <ConfirmarAcao
          titulo="Aprovar a despesa?"
          efeito="A despesa passa a contar no resultado da empresa e fica liberada para pagamento."
          resumo={[
            ['Socorrista', item.socorrista],
            ['Descrição', item.descricao ?? '—'],
            ['Valor', dinheiro.format(item.valor ?? 0)],
          ]}
          avisos={[item.descontaDaComissao
            ? 'Esta despesa desconta da comissão do socorrista.' : null]}
          textoConfirmar="Aprovar despesa"
          aoConfirmar={async () => { await aprovarDespesa(item.id); aoResolver() }}
          aoFechar={() => setConfirmar(false)}
        />
      : null}
  </article>
}

export default function AprovacoesPage() {
  const [fila, setFila] = useState<FilaDeAprovacoes | null>(null)
  const [erro, setErro] = useState('')

  const carregar = useCallback(() => {
    setErro('')
    filaDeAprovacoes().then(setFila).catch(e => setErro((e as Error).message))
  }, [])

  useEffect(carregar, [carregar])

  if (erro) return <ErroPagina mensagem={erro} tentarNovamente={carregar} />
  if (!fila) return <Carregando />

  const turnos = fila.itens.filter(i => i.tipo === 'TURNO')
  const despesas = fila.itens.filter(i => i.tipo === 'DESPESA')

  return <>
    <CabecalhoPagina
      modulo="Operação" titulo="Aprovações"
      descricao="O que os socorristas apontaram e ainda depende de você."
      contexto={`${fila.itens.length} ${fila.itens.length === 1 ? 'item aguardando' : 'itens aguardando'}`}
    />

    {fila.turnosNaoFechados.length
      ? <Painel titulo="Turnos não fechados" etiqueta="Cobrança">
          <ul className="aprovacoes-cobranca">
            {fila.turnosNaoFechados.map(t =>
              <li key={t.id}>
                <strong>{t.socorrista}</strong> abriu o turno em {dataCurta(t.data)} na
                viatura {t.veiculo} e não fechou — {t.diasEmAberto}
                {t.diasEmAberto === 1 ? ' dia' : ' dias'} em aberto.
              </li>)}
          </ul>
        </Painel>
      : null}

    {!fila.itens.length
      ? <Vazio titulo="Nada para aprovar"
          descricao="Quando um socorrista fechar um turno ou lançar uma despesa, aparece aqui." />
      : null}

    {turnos.length
      ? <Painel titulo="Turnos" etiqueta="Quilometragem">
          <div className="aprovacoes-lista">
            {turnos.map(i => <LinhaTurno key={`t${i.id}`} item={i} aoResolver={carregar} />)}
          </div>
        </Painel>
      : null}

    {despesas.length
      ? <Painel titulo="Despesas" etiqueta="Financeiro">
          <div className="aprovacoes-lista">
            {despesas.map(i => <LinhaDespesa key={`d${i.id}`} item={i} aoResolver={carregar} />)}
          </div>
        </Painel>
      : null}
  </>
}
