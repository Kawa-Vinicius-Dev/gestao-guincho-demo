import type { OrdemPagamentoPorto } from '../../types/modelos'
import { baixarRelatorio, type Formato, type Relatorio } from '../exportar'
import { data as formatarData, moeda } from '../../utils/formatadores'
import { detalharOrdemPagamentoPorto, listarOrdensPagamentoPorto } from '../porto'
import { ou, supabase } from '../cliente'
import { listarTodasAsOs, valorDaOs, type LinhaOs } from './listaOs'
import { nomesCurtos } from '../../utils/nomes'
/**
 * Exportacoes do modulo Porto, em Excel e PDF organizados (ver dados/exportar).
 *
 * Cada relatorio e montado a partir dos mesmos dados que a tela mostra; montar
 * e baixar ficam separados para que o conteudo possa ser conferido em teste.
 */

const CONCILIACAO: Record<string, string> = {
  CONCILIADA: 'Conciliada', SEM_COMPOSICAO: 'Sem composição', VALOR_ABAIXO: 'Valor abaixo',
  VALOR_ACIMA: 'Valor acima', RECEBIDA_COM_DIVERGENCIA: 'Divergência no recebimento',
}

const periodoDaOp = (op: OrdemPagamentoPorto) =>
  op.periodoInicio && op.periodoFim ? `${formatarData(op.periodoInicio)} a ${formatarData(op.periodoFim)}` : ''

export function relatorioDeOps(ops: OrdemPagamentoPorto[], params?: URLSearchParams): Relatorio {
  const inicio = params?.get('dataInicio'), fim = params?.get('dataFim')
  const servicos = ops.reduce((s, op) => s + op.quantidadeOrdensServico, 0)
  const valor = ops.reduce((s, op) => s + op.valorOrdensServico, 0)
  return {
    titulo: 'Ordens de pagamento Porto',
    subtitulo: inicio && fim ? `Período: ${formatarData(inicio)} a ${formatarData(fim)}` : 'Todas as OPs',
    resumo: [['OPs', String(ops.length)], ['Serviços', String(servicos)], ['Valor dos serviços', moeda(valor)]],
    secoes: [{
      colunas: [
        { titulo: 'OP', largura: 12 }, { titulo: 'Período', largura: 25 },
        { titulo: 'Serviços', tipo: 'numero', largura: 10 }, { titulo: 'Valor dos serviços', tipo: 'moeda', largura: 18 },
        { titulo: 'Valor da OP', tipo: 'moeda', largura: 16 }, { titulo: 'Diferença', tipo: 'moeda', largura: 14 },
        { titulo: 'Conciliação', largura: 18 },
      ],
      linhas: ops.map(op => [op.numero, periodoDaOp(op), op.quantidadeOrdensServico, op.valorOrdensServico,
        op.valorTotal, op.divergencia, CONCILIACAO[op.statusConciliacao] ?? op.statusConciliacao]),
      totais: ['Total', null, servicos, valor, ops.reduce((s, op) => s + op.valorTotal, 0),
        ops.reduce((s, op) => s + op.divergencia, 0), null],
      vazio: 'Nenhuma OP no período.',
    }],
    nomeArquivo: inicio && fim ? `ops-porto-${inicio}-a-${fim}` : 'ops-porto',
  }
}

export async function baixarRelatorioPorto(formato: Formato, params?: URLSearchParams): Promise<void> {
  await baixarRelatorio(relatorioDeOps(await listarOrdensPagamentoPorto(params), params), formato)
}

export async function baixarRelatorioOpPorto(id: number, formato: Formato): Promise<void> {
  const detalhe = await detalharOrdemPagamentoPorto(id)
  const op = detalhe.ordemPagamento
  const oss = detalhe.ordensServico
  await baixarRelatorio({
    titulo: `Ordem de pagamento ${op.numero}`,
    subtitulo: op.periodoInicio && op.periodoFim ? `Período: ${periodoDaOp(op)}` : undefined,
    resumo: [
      ['Serviços', String(op.quantidadeOrdensServico)],
      ['Valor dos serviços', moeda(op.valorOrdensServico)],
      ['Valor da OP', moeda(op.valorTotal)],
      ['Conciliação', CONCILIACAO[op.statusConciliacao] ?? op.statusConciliacao],
    ],
    secoes: [
      {
        titulo: 'Ordens de serviço da OP',
        colunas: [
          { titulo: 'OS', largura: 16 }, { titulo: 'Atendimento', tipo: 'data', largura: 13 },
          { titulo: 'Especialidade', largura: 20 }, { titulo: 'Socorrista', largura: 32 },
          { titulo: 'Viatura', largura: 11 }, { titulo: 'Valor', tipo: 'moeda', largura: 14 },
        ],
        linhas: oss.map(os => [os.numero, os.dataAtendimento, os.especialidade, os.motorista ?? os.socorrista,
          os.viatura, os.valorTotal]),
        totais: ['Total', null, null, null, null, oss.reduce((s, os) => s + os.valorTotal, 0)],
        vazio: 'Nenhuma OS vinculada a esta OP.',
      },
      ...(detalhe.justificativas.length ? [{
        titulo: 'Justificativas',
        colunas: [
          { titulo: 'Motivo', largura: 18 }, { titulo: 'Observação', largura: 40 },
          { titulo: 'Diferença', tipo: 'moeda' as const, largura: 14 }, { titulo: 'Usuário', largura: 20 },
          { titulo: 'Registrada em', tipo: 'data' as const, largura: 14 },
        ],
        linhas: detalhe.justificativas.map(j => [j.motivo, j.observacao, j.valorDiferenca, j.usuario, j.criadoEm.slice(0, 10)]),
      }] : []),
    ],
    nomeArquivo: `op-porto-${op.numero}`,
  }, formato)
}

/**
 * Relatorio diario dos servicos prestados.
 *
 * E o fechamento do dia de quem opera: o que a equipe atendeu, com quem estava
 * na viatura e quanto cada servico vale, somado por socorrista e por
 * especialidade.
 *
 * Os servicos, o valor e o "sem valor" vem da mesma lista das outras telas
 * (porto_listar_os): o valor e o da OP, ou o informado a mao antes dela. Servico
 * sem valor aparece como "a precificar", e nao como R$ 0,00 — zero seria uma
 * afirmacao errada. A lista antiga lia so o valor da OP e mostrava "a precificar"
 * ate no servico com valor informado.
 */
export async function relatorioDiarioPorto(dia: string): Promise<Relatorio> {
  const [pagina, extras] = await Promise.all([
    listarTodasAsOs({ inicio: dia, fim: dia }),
    // A hora e os cancelados nao vem na lista: uma leitura curta, so disso.
    supabase().from('ordens_servico_porto').select('id,data_hora_atendimento,status_operacional').eq('data_atendimento', dia),
  ])
  const linhasExtras = (ou(extras, 'Não foi possível carregar o dia.') ?? []) as
    { id: number; data_hora_atendimento: string | null; status_operacional: string }[]
  const horaPorId = new Map(linhasExtras.map(l => [l.id, l.data_hora_atendimento]))
  const cancelados = linhasExtras.filter(l => l.status_operacional === 'CANCELADO').length
  const validos = [...pagina.itens].sort((a, b) =>
    (horaPorId.get(a.id) ?? '').localeCompare(horaPorId.get(b.id) ?? '') || a.numero.localeCompare(b.numero))
  const soma = (lista: LinhaOs[]) => lista.reduce((total, os) => total + valorDaOs(os), 0)
  const valorOuPendente = (os: LinhaOs) => (os.semValor ? 'a precificar' : valorDaOs(os))
  const totalOuPendente = (total: number) => (total > 0 ? total : 'a precificar')
  // Hora de Brasilia: o banco devolve o instante em UTC.
  const hora = (instante?: string | null) => instante
    ? new Date(instante).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
    : ''
  const curtos = nomesCurtos(validos.map(os => os.motorista))

  const agrupar = (chave: (os: LinhaOs) => string) => {
    const grupos = new Map<string, LinhaOs[]>()
    for (const os of validos) {
      const nome = chave(os) || 'Não informado'
      grupos.set(nome, [...(grupos.get(nome) ?? []), os])
    }
    return [...grupos.entries()]
      .sort((a, b) => soma(b[1]) - soma(a[1]) || b[1].length - a[1].length)
      .map(([nome, lista]) => [nome, lista.length, totalOuPendente(soma(lista))])
  }

  return {
    titulo: `Serviços prestados em ${formatarData(dia)}`,
    resumo: [
      ['Serviços', String(validos.length)],
      ['Valor conhecido', soma(validos) > 0 ? moeda(soma(validos)) : 'a precificar'],
      ['Sem valor ainda', String(validos.filter(os => os.semValor).length)],
      ...(cancelados ? [['Cancelados', String(cancelados)] as [string, string]] : []),
    ],
    secoes: [
      {
        titulo: 'Serviços',
        colunas: [
          { titulo: 'OS', largura: 16 }, { titulo: 'Hora', largura: 8 }, { titulo: 'Especialidade', largura: 20 },
          { titulo: 'Viatura', largura: 11 }, { titulo: 'Socorrista', largura: 22 }, { titulo: 'Valor', tipo: 'moeda', largura: 14 },
        ],
        linhas: validos.map(os => [os.numero, hora(horaPorId.get(os.id)), os.especialidade, os.viatura ?? 'Sem viatura',
          curtos.get(os.motorista ?? '') ?? os.motorista ?? os.socorristaNoArquivo ?? 'Sem socorrista', valorOuPendente(os)]),
        totais: ['Total', null, null, null, `${validos.length} serviços`, soma(validos)],
        vazio: 'Nenhum serviço neste dia.',
      },
      {
        titulo: 'Por socorrista',
        colunas: [{ titulo: 'Socorrista', largura: 22 }, { titulo: 'Serviços', tipo: 'numero' }, { titulo: 'Valor', tipo: 'moeda', largura: 14 }],
        linhas: agrupar(os => curtos.get(os.motorista ?? '') ?? os.motorista ?? os.socorristaNoArquivo ?? ''),
      },
      {
        titulo: 'Por especialidade',
        colunas: [{ titulo: 'Especialidade', largura: 32 }, { titulo: 'Serviços', tipo: 'numero' }, { titulo: 'Valor', tipo: 'moeda', largura: 14 }],
        linhas: agrupar(os => os.especialidade ?? ''),
      },
    ],
    nomeArquivo: `servicos-prestados-${dia}`,
  }
}

export async function baixarRelatorioDiarioPorto(dia: string, formato: Formato): Promise<void> {
  await baixarRelatorio(await relatorioDiarioPorto(dia), formato)
}
