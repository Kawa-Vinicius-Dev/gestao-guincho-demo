import type { OrdemPagamentoPorto } from '../types/modelos'
import { data } from './formatadores'

/**
 * O periodo, nas telas de comissao, e a ordem de pagamento.
 *
 * Antes era o ciclo do calendario, cadastrado a mao com meses de antecedencia —
 * e a tela precisava adivinhar qual ciclo ja tinha sido pago para abrir no lugar
 * certo. A OP nao tem esse problema: ela so existe depois de paga. A mais
 * recente e a que interessa, e e nela que a conferencia acontece.
 */
export function opCorrente(
  ops: OrdemPagamentoPorto[],
): OrdemPagamentoPorto | undefined {
  return [...ops].sort((a, b) =>
    (b.periodoFim ?? b.dataPagamentoProgramada ?? '')
      .localeCompare(a.periodoFim ?? a.dataPagamentoProgramada ?? ''))[0]
}

/** "OP 06389821 · 30/03/2026 a 29/04/2026" — o numero e a janela que ele cobre. */
export function rotuloOp(op: OrdemPagamentoPorto): string {
  const janela = op.periodoInicio && op.periodoFim
    ? ` · ${data(op.periodoInicio)} a ${data(op.periodoFim)}`
    : ''
  return `OP ${op.numero}${janela}`
}

/**
 * Um periodo de pagamento da Porto: uma ou mais OPs da mesma quinzena.
 *
 * A Porto paga a mesma quinzena em mais de uma OP (Taxi numa, Guincho na outra,
 * as duas de 27/08 a 14-15/09). Kawa: "tudo que envolve esse periodo precisa ter
 * as duas". Toda tela escolhe o periodo, e os valores somam as OPs dele.
 */
export interface PeriodoPorto {
  /** Ids das OPs unidos por "-": estavel para lembrar o filtro. */
  id: string
  ids: number[]
  numeros: string[]
  periodoInicio?: string
  periodoFim?: string
  /** Quinzena em andamento, que ainda nao tem OP (ids e numeros vazios). */
  semOp?: boolean
}

const DIA_MS = 86_400_000

function diaSeguinte(iso: string) {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + DIA_MS).toISOString().slice(0, 10)
}
/** OPs que fecham com ate uma semana de diferenca e se cruzam sao do mesmo periodo. */
const FOLGA_DIAS = 7

const inicioDe = (op: OrdemPagamentoPorto) => op.periodoInicio ?? op.periodoFim ?? op.dataPagamentoProgramada
const fimDe = (op: OrdemPagamentoPorto) => op.periodoFim ?? op.dataPagamentoProgramada ?? op.periodoInicio

export function agruparPorPeriodo(ops: OrdemPagamentoPorto[]): PeriodoPorto[] {
  const ordenadas = [...ops].sort((a, b) => (fimDe(a) ?? '').localeCompare(fimDe(b) ?? '') || a.id - b.id)
  const grupos: { ops: OrdemPagamentoPorto[]; inicio?: string; fim?: string }[] = []
  for (const op of ordenadas) {
    const inicio = inicioDe(op), fim = fimDe(op)
    const atual = grupos.at(-1)
    const cruza = Boolean(atual?.inicio && atual.fim && inicio && fim
      && inicio <= atual.fim && fim >= atual.inicio
      && Math.abs(Date.parse(fim) - Date.parse(atual.fim)) <= FOLGA_DIAS * DIA_MS)
    if (atual && cruza) {
      atual.ops.push(op)
      if (inicio && (!atual.inicio || inicio < atual.inicio)) atual.inicio = inicio
      if (fim && (!atual.fim || fim > atual.fim)) atual.fim = fim
    } else {
      grupos.push({ ops: [op], inicio, fim })
    }
  }
  // Onde a quinzena comeca. Os fins das OPs seguem o calendario da Porto; os
  // inicios, quando vem das OS, nao: a OP pode trazer servicos atrasados de
  // outros meses, e um so esticava o periodo inteiro — a 06427802 trouxe 13
  // servicos de 19/06 a 02/07, pagos em agosto, e o seletor mostrava "19/06 a
  // 13/08", somando na Visao geral a receita de 8 OPs.
  //
  // O inicio e a primeira data de inicio do grupo que nao recua para antes do
  // fechamento anterior. OP com a quinzena da Porto informada ja traz o inicio
  // certo (01/09, 15/08...) e ele vence; sem quinzena informada, o inicio
  // esticado e descartado e a quinzena comeca no dia seguinte ao fechamento
  // anterior. Onde o servico atrasado conta nao muda: na OP em que entrou.
  for (let i = 0; i < grupos.length; i++) {
    const anterior = i > 0 ? grupos[i - 1].fim : undefined
    const piso = anterior ? diaSeguinte(anterior) : undefined
    const inicios = grupos[i].ops.map(inicioDe).filter((d): d is string => Boolean(d))
    const validos = piso ? inicios.filter(d => d >= piso) : inicios
    const primeiro = [...validos].sort()[0]
    grupos[i].inicio = primeiro ?? piso ?? grupos[i].inicio
  }
  return grupos.reverse().map(g => {
    const doGrupo = [...g.ops].sort((a, b) => a.numero.localeCompare(b.numero))
    return {
      id: doGrupo.map(o => o.id).sort((a, b) => a - b).join('-'),
      ids: doGrupo.map(o => o.id),
      numeros: doGrupo.map(o => o.numero),
      periodoInicio: g.inicio,
      periodoFim: g.fim,
    }
  })
}

/** O periodo mais recente — a lista ja vem do mais novo para o mais antigo. */
export function periodoCorrente(periodos: PeriodoPorto[]): PeriodoPorto | undefined {
  return [...periodos].sort((a, b) => (b.periodoFim ?? '').localeCompare(a.periodoFim ?? ''))[0]
}

/** "27/08/2026 a 15/09/2026 · OPs 06438807 e 06438808". */
export function rotuloPeriodo(periodo: PeriodoPorto): string {
  const janela = periodo.periodoInicio && periodo.periodoFim
    ? `${data(periodo.periodoInicio)} a ${data(periodo.periodoFim)} · `
    : ''
  const ops = !periodo.numeros.length ? 'aguardando OP'
    : periodo.numeros.length > 1
    ? `OPs ${periodo.numeros.slice(0, -1).join(', ')} e ${periodo.numeros.at(-1)}`
    : `OP ${periodo.numeros[0]}`
  return `${janela}${ops}`
}
