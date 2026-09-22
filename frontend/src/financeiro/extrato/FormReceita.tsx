import { useState, type FormEvent } from 'react'
import { CampoValor } from '../../components/CampoValor'
import { Campo, Selecao } from '../../components/Campos'
import { AcoesModal, Modal } from '../../components/Modal'
import { atualizarReceita, criarReceita } from '../../dados/receitas'
import type { Categoria, Receita } from '../../types/modelos'
import { hojeIso, moeda } from '../../utils/formatadores'

/**
 * Registrar receita, direto no extrato.
 *
 * Kawa, 22/09/2026: "tirar totalmente a tela de credito, apenas uma opcao de
 * registrar receita, simples, em extrato". Credito da Porto, um servico avulso,
 * qualquer dinheiro que entrou fora das OS importadas: e tudo receita, e o
 * formulario pede so o que uma receita precisa.
 *
 * Receita lancada a mao nao entra na comissao: a comissao sai das OS.
 */
export function FormReceita({ categorias, receita, aoSalvar, aoFechar }: {
  categorias: Categoria[]
  /** Preenchida quando e edicao. */
  receita?: Receita
  aoSalvar: (mensagem: string) => void
  aoFechar: () => void
}) {
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const f = new FormData(evento.currentTarget)
    const data = String(f.get('data'))
    const recebida = f.get('status') === 'RECEBIDA'
    const dados = {
      descricao: String(f.get('descricao')).trim(),
      valor: Number(f.get('valor')),
      dataCompetencia: data,
      dataRecebimento: recebida ? data : null,
      status: recebida ? 'RECEBIDA' as const : 'PREVISTA' as const,
      recorrente: false,
      categoriaId: f.get('categoriaId') ? Number(f.get('categoriaId')) : null,
      observacoes: String(f.get('observacoes') || '') || null,
      // O que o formulario nao mostra, a edicao preserva.
      contratanteId: receita?.contratanteId ?? null,
      veiculoId: receita?.veiculoId ?? null,
    }
    setSalvando(true); setErro('')
    try {
      if (receita) await atualizarReceita(receita.id, dados)
      else await criarReceita(dados)
      aoSalvar(receita ? 'Receita atualizada.' : `Receita de ${moeda(dados.valor)} registrada.`)
    } catch (e) { setErro((e as Error).message) }
    finally { setSalvando(false) }
  }

  return <Modal etiqueta="Receita" titulo={receita ? 'Editar receita' : 'Registrar receita'} aoFechar={aoFechar}>
    <form onSubmit={salvar} className="form-grid two-columns">
      {erro ? <div className="form-alert field-wide" role="alert">{erro}</div> : null}
      <Campo rotulo="Descrição" className="field-wide">
        <input name="descricao" required defaultValue={receita?.descricao} autoCapitalize="sentences" autoComplete="off"
          placeholder="Ex.: Créditos da OP 1234"/>
      </Campo>
      <CampoValor rotulo="Valor" name="valor" defaultValue={receita?.valor} required/>
      <Campo rotulo="Data"><input name="data" type="date" defaultValue={receita?.dataCompetencia ?? hojeIso()} required/></Campo>
      <Selecao rotulo="Categoria" name="categoriaId" vazio="Sem categoria" defaultValue={receita?.categoriaId ?? ''}
        opcoes={categorias.filter(c => c.tipo === 'RECEITA' && c.ativo).map(c => ({ valor: c.id, texto: c.nome }))}/>
      <Selecao rotulo="Situação" name="status" defaultValue={receita?.status === 'PREVISTA' ? 'PREVISTA' : 'RECEBIDA'}
        opcoes={[{ valor: 'RECEBIDA', texto: 'Recebida' }, { valor: 'PREVISTA', texto: 'A receber' }]}/>
      <Campo rotulo="Observações" className="field-wide">
        <input name="observacoes" defaultValue={receita?.observacoes} autoCapitalize="sentences" autoComplete="off"/>
      </Campo>
      <AcoesModal aoCancelar={aoFechar}>
        <button className="button button-primary" disabled={salvando}>
          {salvando ? 'Salvando…' : receita ? 'Salvar alterações' : 'Registrar receita'}
        </button>
      </AcoesModal>
    </form>
  </Modal>
}
