import type { OrdemPagamentoPorto } from '../../types/modelos'
import { baixarRelatorio, type Formato, type Relatorio } from '../exportar'
import { data as formatarData, moeda } from '../../utils/formatadores'
import { detalharOrdemPagamentoPorto, listarOrdensPagamentoPorto } from '../porto'
import { ou, supabase } from '../cliente'
import { listarTodasAsOs, type LinhaOs } from './listaOs'
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
 * Relatorio operacional: os servicos prestados de uma data a outra.
 *
 * Kawa, 23/09/2026: controle da operacao, nao do dinheiro. Conta pela data do
 * atendimento, lista todos os servicos (OS, data, especialidade, socorrista,
 * viatura e situacao) e nao mostra valor nenhum. As canceladas aparecem
 * marcadas e contadas a parte: o servico aconteceu, mas saiu da producao.
 *
 * O resumo vem primeiro, em uma folha; a lista continua nas folhas seguintes
 * quando o periodo e grande, e a tela avisa antes quantas folhas serao.
 */
export async function relatorioOperacional(inicio: string, fim: string): Promise<Relatorio> {
  const [pagina, canceladas] = await Promise.all([
    listarTodasAsOs({ inicio, fim, porCompetencia: false }),
    // A lista padrao nao traz as canceladas: uma leitura curta, so delas.
    supabase().from('ordens_servico_porto')
      .select('id,numero,data_atendimento,especialidade,sigla_viatura,motoristas(nome)')
      .gte('data_atendimento', inicio).lte('data_atendimento', fim).eq('status_operacional', 'CANCELADO'),
  ])
  type Cancelada = { id: number; numero: string; data_atendimento: string | null; especialidade: string | null
    sigla_viatura: string | null; motoristas: { nome: string } | { nome: string }[] | null }
  const idsDaLista = new Set(pagina.itens.map(os => os.id))
  const listaCanceladas = ((ou(canceladas, 'Não foi possível carregar as OS canceladas.') ?? []) as Cancelada[])
    .filter(c => !idsDaLista.has(c.id))
  const nomeDe = (c: Cancelada) => (Array.isArray(c.motoristas) ? c.motoristas[0] : c.motoristas)?.nome

  const curtos = nomesCurtos([...pagina.itens.map(os => os.motorista), ...listaCanceladas.map(nomeDe)])
  const socorrista = (nome?: string | null) => (nome ? curtos.get(nome) ?? nome : 'Sem socorrista')
  const naOp = pagina.itens.filter(os => os.numeroOp).length

  const linhas: { data: string; numero: string; linha: (string | null | undefined)[] }[] = [
    ...pagina.itens.map(os => ({ data: os.dataAtendimento ?? '', numero: os.numero, linha: [
      os.dataAtendimento, os.numero, os.especialidade, socorrista(os.motorista), os.viatura ?? 'Sem viatura',
      os.numeroOp ? `OP ${os.numeroOp}` : 'Aguardando OP'] })),
    ...listaCanceladas.map(c => ({ data: c.data_atendimento ?? '', numero: c.numero, linha: [
      c.data_atendimento, c.numero, c.especialidade, socorrista(nomeDe(c)), c.sigla_viatura ?? 'Sem viatura', 'Cancelada'] })),
  ].sort((a, b) => a.data.localeCompare(b.data) || a.numero.localeCompare(b.numero))

  const contar = (chave: (os: LinhaOs) => string | undefined) => {
    const grupos = new Map<string, number>()
    for (const os of pagina.itens) {
      const nome = chave(os)?.trim() || 'Não informado'
      grupos.set(nome, (grupos.get(nome) ?? 0) + 1)
    }
    const ordenadas = [...grupos].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    // Quadro curto: os que mais atenderam e "Outros", para o resumo caber no topo.
    return ordenadas.length <= 8 ? ordenadas
      : [...ordenadas.slice(0, 7), [`Outros (${ordenadas.length - 7})`, ordenadas.slice(7).reduce((t, g) => t + g[1], 0)]]
  }
  const mesmoDia = inicio === fim

  return {
    titulo: 'Relatório operacional',
    subtitulo: mesmoDia ? `Serviços de ${formatarData(inicio)}` : `Serviços de ${formatarData(inicio)} a ${formatarData(fim)}`,
    compacto: true,
    retrato: true,
    resumo: [
      ['Serviços', String(pagina.itens.length)],
      ['Já na OP', String(naOp)],
      ['Aguardando OP', String(pagina.itens.length - naOp)],
      ['Canceladas', String(listaCanceladas.length)],
      ['Sem viatura', String(pagina.itens.filter(os => !os.viatura).length)],
      ['Contagem', 'pela data do atendimento; canceladas fora do total'],
    ],
    secoes: [
      {
        titulo: 'Por especialidade', metade: true,
        colunas: [{ titulo: 'Especialidade', largura: 28 }, { titulo: 'Serviços', tipo: 'numero', largura: 10 }],
        linhas: contar(os => os.especialidade),
        totais: ['Total', pagina.itens.length],
      },
      {
        titulo: 'Por socorrista', metade: true,
        colunas: [{ titulo: 'Socorrista', largura: 24 }, { titulo: 'Serviços', tipo: 'numero', largura: 10 }],
        linhas: contar(os => (os.motorista ? socorrista(os.motorista) : 'Sem socorrista')),
        totais: ['Total', pagina.itens.length],
      },
      {
        titulo: 'Serviços prestados',
        colunas: [
          { titulo: 'Data', tipo: 'data', largura: 12 }, { titulo: 'OS', largura: 16 },
          { titulo: 'Especialidade', largura: 24 }, { titulo: 'Socorrista', largura: 18 },
          { titulo: 'Viatura', largura: 11 }, { titulo: 'Situação', largura: 16 },
        ],
        linhas: linhas.map(l => l.linha),
        totais: ['Total', `${pagina.itens.length} serviços`, null, null, null,
          listaCanceladas.length ? `+ ${listaCanceladas.length} cancelada${listaCanceladas.length === 1 ? '' : 's'}` : null],
        vazio: 'Nenhum serviço no período.',
      },
    ],
    nomeArquivo: mesmoDia ? `operacional-${inicio}` : `operacional-${inicio}-a-${fim}`,
  }
}
