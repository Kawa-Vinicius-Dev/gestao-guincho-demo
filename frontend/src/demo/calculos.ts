import type { DemoState, ResultadoVeiculoDemo, ResumoMensalDemo } from './modelosDemo'

export const noMes = (data: string, mes: string) => data.startsWith(mes)
const soma = (valores: number[]) => valores.reduce((total, valor) => total + valor, 0)
export const entraNoResultado = (item: DemoState['lancamentos'][number]) =>
  item.tipo !== 'DESPESA' || item.status !== 'PENDENTE'

export function resultadoPorVeiculo(state: DemoState, mes: string): ResultadoVeiculoDemo[] {
  const lancamentos = state.lancamentos.filter(item => noMes(item.data, mes) && entraNoResultado(item))
  const kms = state.quilometragens.filter(item => noMes(item.data, mes))

  return state.veiculos.map(veiculo => {
    const financeiros = lancamentos.filter(item => item.veiculoId === veiculo.id)
    const quilometragens = kms.filter(item => item.veiculoId === veiculo.id)
    const receita = soma(financeiros.filter(item => item.tipo === 'RECEITA').map(item => item.valor))
    const despesas = soma(financeiros.filter(item => item.tipo === 'DESPESA').map(item => item.valor))
    const lucro = receita - despesas
    const margem = receita ? (lucro / receita) * 100 : 0
    const kmRodado = soma(quilometragens.map(item => item.kmRodado))
    const kmMorto = soma(quilometragens.map(item => item.kmMorto))
    const percentualKmMorto = kmRodado ? (kmMorto / kmRodado) * 100 : 0
    const valorCategoria = (categoria: string) => soma(financeiros.filter(item => item.categoria === categoria).map(item => item.valor))
    let status: ResultadoVeiculoDemo['status'] = 'MONITORAR'
    if (lucro < 0) status = 'PREJUIZO'
    else if (percentualKmMorto > veiculo.metaKmMorto + 5) status = 'ATENCAO_KM'
    else if ((!receita && !despesas) || margem < veiculo.metaMargem) status = 'MONITORAR'
    else status = 'SAUDAVEL'
    return {
      veiculo, receita, despesas, lucro, margem, kmRodado, kmMorto, percentualKmMorto,
      combustivel: valorCategoria('Combustível'),
      manutencao: valorCategoria('Manutenção'),
      seguro: valorCategoria('Seguro'),
      parcela: valorCategoria('Parcela/financiamento de veículo'),
      custoKmMorto: soma(quilometragens.map(item => item.kmMorto * item.custoPorKm)),
      litros: soma(financeiros.map(item => item.litros ?? 0)),
      status,
    }
  })
}

export function resumoMensal(state: DemoState, mes: string): ResumoMensalDemo {
  const lancamentos = state.lancamentos.filter(item => noMes(item.data, mes) && entraNoResultado(item))
  const quilometragens = state.quilometragens.filter(item => noMes(item.data, mes))
  const receita = soma(lancamentos.filter(item => item.tipo === 'RECEITA').map(item => item.valor))
  const despesas = soma(lancamentos.filter(item => item.tipo === 'DESPESA').map(item => item.valor))
  const lucro = receita - despesas
  const kmRodado = soma(quilometragens.map(item => item.kmRodado))
  const kmMorto = soma(quilometragens.map(item => item.kmMorto))
  return {
    mes,
    receita,
    despesas,
    lucro,
    margem: receita ? (lucro / receita) * 100 : 0,
    aReceber: soma(lancamentos.filter(item => item.tipo === 'RECEITA' && item.status === 'A_RECEBER').map(item => item.valor)),
    kmRodado,
    kmMorto,
    custoKmMorto: soma(quilometragens.map(item => item.kmMorto * item.custoPorKm)),
    percentualKmMorto: kmRodado ? (kmMorto / kmRodado) * 100 : 0,
    resultadoVeiculos: resultadoPorVeiculo(state, mes),
  }
}

export function despesasPorCategoria(state: DemoState, mes: string) {
  const mapa = new Map<string, number>()
  state.lancamentos.filter(item => item.tipo === 'DESPESA' && item.status !== 'PENDENTE' && noMes(item.data, mes))
    .forEach(item => mapa.set(item.categoria, (mapa.get(item.categoria) ?? 0) + item.valor))
  return [...mapa.entries()].map(([categoria, valor]) => ({ categoria, valor })).sort((a, b) => b.valor - a.valor)
}

export function serieMensal(state: DemoState, quantidade = 6) {
  const meses = [...new Set(state.lancamentos.map(item => item.data.slice(0, 7)))].sort().slice(-quantidade)
  return meses.map(mes => {
    const itens = state.lancamentos.filter(item => noMes(item.data, mes) && entraNoResultado(item))
    return {
      mes,
      entradas: soma(itens.filter(item => item.tipo === 'RECEITA').map(item => item.valor)),
      saidas: soma(itens.filter(item => item.tipo === 'DESPESA').map(item => item.valor)),
    }
  })
}
