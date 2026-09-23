import { useCallback, useEffect, useState } from 'react'
import { LinkSocorrista, LinkViatura } from '../components/LinksDeDado'
import { ConfirmarAcao } from '../components/ConfirmarAcao'
import { Carregando, ErroPagina, Vazio } from '../components/EstadoPagina'
import { Modal } from '../components/Modal'
import './aprovacoes-foto.css'
import { CabecalhoPagina, Painel } from '../components/ui/Pagina'
import { aprovarDespesa, excluirDespesa } from '../dados/despesas'
import { ConfirmarExclusao } from '../components/ConfirmarExclusao'
import type { Despesa } from '../types/modelos'
import {
  apagarFotosDoTurno, aprovarTurno, baixarFoto, devolverTurno, filaDeAprovacoes, linkDaFoto,
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

/** "07:42", do horario em que o socorrista abriu ou fechou o turno. */
function hora(iso?: string) {
  return iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'
}

function dataCurta(iso: string) {
  return new Date(`${iso}T12:00`).toLocaleDateString('pt-BR')
}

/** Seta para baixo sobre a bandeja: o icone de download de sempre. */
function IconeBaixar() {
  return <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false" fill="none"
    stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 3v10M5.5 8.5 10 13l4.5-4.5M3.5 14.5v2h13v-2"/>
  </svg>
}

function IconeFoto() {
  return <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false" fill="none"
    stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6.5h3l1.5-2h5L14 6.5h3v9H3z"/><circle cx="10" cy="11" r="2.8"/>
  </svg>
}

/**
 * A foto e consulta, nao decisao: fica como link discreto a esquerda, e as duas
 * acoes (recusar e aprovar) ficam a direita, do mesmo tamanho (Kawa, 23/09/2026:
 * "os bottons tao feios").
 */
function VerFoto({ caminho, rotulo, nomeDoArquivo }: { caminho: string; rotulo: string; nomeDoArquivo?: string }) {
  const [url, setUrl] = useState('')
  const [erro, setErro] = useState('')
  return <>
    <button type="button" className="aprovacao-foto-link"
      onClick={() => linkDaFoto(caminho).then(setUrl).catch(e => setErro((e as Error).message))}>
      <IconeFoto/>{rotulo}
    </button>
    {erro ? <span className="form-alert">{erro}</span> : null}
    {/* Baixar fica no topo da foto aberta, so o icone (Kawa, 23/09/2026: "a ideia
        e simplificar"). A foto e apagada depois da aprovacao, e numa divergencia
        quem aprova precisa guardar a prova. */}
    {url
      ? <Modal etiqueta="Comprovação" titulo={rotulo} fecharAoClicarFora aoFechar={() => setUrl('')}
          acoes={nomeDoArquivo
            ? <button type="button" className="botao-icone" aria-label="Baixar a foto" title="Baixar a foto"
                onClick={() => baixarFoto(caminho, nomeDoArquivo).catch(e => setErro((e as Error).message))}>
                <IconeBaixar/>
              </button>
            : undefined}>
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
      <div><dt>Início do turno</dt><dd>{hora(item.abertoEm)}</dd></div>
      <div><dt>Fim do turno</dt><dd>{hora(item.fechadoEm)}</dd></div>
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
      <span className="aprovacao-fotos">
        {item.fotoAbertura ? <VerFoto caminho={item.fotoAbertura} rotulo="Foto do início"
          nomeDoArquivo={`turno-${item.data}-${item.socorrista}-saida.jpg`} /> : null}
        {item.fotoFechamento ? <VerFoto caminho={item.fotoFechamento} rotulo="Foto do fim"
          nomeDoArquivo={`turno-${item.data}-${item.socorrista}-chegada.jpg`} /> : null}
      </span>
      <button type="button" className="button button-ghost acao-recusar" onClick={() => setDevolvendo(true)}>
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
            ? 'Sem km produtivo informado, o turno inteiro vira km morto.' : null,
            item.fotoAbertura || item.fotoFechamento
              ? 'As fotos do odômetro são apagadas depois da aprovação. Se houver divergência, abra a foto e baixe antes.' : null]}
          textoConfirmar="Aprovar turno"
          aoConfirmar={async () => {
            await aprovarTurno(item.id, produtivo)
            await apagarFotosDoTurno([item.fotoAbertura, item.fotoFechamento])
            aoResolver()
          }}
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
      <span className="aprovacao-fotos">
        {item.comprovante ? <VerFoto caminho={item.comprovante} rotulo="Ver comprovante" /> : null}
      </span>
      <button type="button" className="button button-ghost acao-recusar" onClick={() => setExcluindo(true)}>
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
