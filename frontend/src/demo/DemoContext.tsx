import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { dadosIniciais } from './dadosIniciais'
import type { DemoState, FuncionarioDemo, LancamentoDemo, QuilometragemDemo, VeiculoDemo } from './modelosDemo'

const STORAGE_KEY = 'gestao-guincho:demo:v3'

interface DemoValue {
  state: DemoState
  adicionarLancamento(dados: Omit<LancamentoDemo, 'id'>): void
  adicionarQuilometragem(dados: Omit<QuilometragemDemo, 'id'>): void
  adicionarVeiculo(dados: Omit<VeiculoDemo, 'id'>): void
  adicionarFuncionario(dados: Omit<FuncionarioDemo, 'id'>): void
  atualizarStatusLancamento(id: number, status: LancamentoDemo['status']): void
  importarExemplo(nomeArquivo: string): number
  restaurarDemo(): void
}

const DemoContext = createContext<DemoValue | null>(null)
const clonarDados = () => structuredClone(dadosIniciais)

function carregar(): DemoState {
  try {
    const salvo = localStorage.getItem(STORAGE_KEY)
    return salvo ? JSON.parse(salvo) as DemoState : clonarDados()
  } catch {
    return clonarDados()
  }
}

export function DemoProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DemoState>(carregar)

  const persistir = useCallback((alterar: (atual: DemoState) => DemoState) => {
    setState(atual => {
      const proximo = alterar(atual)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(proximo))
      return proximo
    })
  }, [])

  const adicionarLancamento = useCallback((dados: Omit<LancamentoDemo, 'id'>) => {
    persistir(atual => ({
      ...atual,
      lancamentos: [{ ...dados, id: Math.max(0, ...atual.lancamentos.map(item => item.id)) + 1 }, ...atual.lancamentos],
    }))
  }, [persistir])

  const adicionarQuilometragem = useCallback((dados: Omit<QuilometragemDemo, 'id'>) => {
    persistir(atual => {
      const id = Math.max(0, ...atual.quilometragens.map(item => item.id)) + 1
      const custo = dados.kmMorto * dados.custoPorKm
      const lancamentoId = Math.max(0, ...atual.lancamentos.map(item => item.id)) + 1
      const veiculo = atual.veiculos.find(item => item.id === dados.veiculoId)
      return {
        ...atual,
        quilometragens: [{ ...dados, id }, ...atual.quilometragens],
        lancamentos: [{
          id: lancamentoId,
          tipo: 'DESPESA',
          categoria: 'Km morto',
          descricao: `Custo do km morto — ${veiculo?.codigo ?? 'veículo'}`,
          valor: custo,
          data: dados.data,
          veiculoId: dados.veiculoId,
          funcionarioId: dados.funcionarioId,
          status: 'PAGO',
          origem: 'Manual',
          classeCusto: 'VARIAVEL',
        }, ...atual.lancamentos],
      }
    })
  }, [persistir])

  const adicionarVeiculo = useCallback((dados: Omit<VeiculoDemo, 'id'>) => {
    persistir(atual => ({ ...atual, veiculos: [...atual.veiculos, { ...dados, id: Math.max(0, ...atual.veiculos.map(item => item.id)) + 1 }] }))
  }, [persistir])

  const adicionarFuncionario = useCallback((dados: Omit<FuncionarioDemo, 'id'>) => {
    persistir(atual => ({ ...atual, funcionarios: [...atual.funcionarios, { ...dados, id: Math.max(0, ...atual.funcionarios.map(item => item.id)) + 1 }] }))
  }, [persistir])

  const atualizarStatusLancamento = useCallback((id: number, status: LancamentoDemo['status']) => {
    persistir(atual => ({
      ...atual,
      lancamentos: atual.lancamentos.map(item => item.id === id ? { ...item, status } : item),
    }))
  }, [persistir])

  const importarExemplo = useCallback((nomeArquivo: string) => {
    const linhas = 3
    persistir(atual => {
      if (atual.importacoes.some(item => item.arquivo === nomeArquivo)) return atual
      const proximoLancamento = Math.max(0, ...atual.lancamentos.map(item => item.id)) + 1
      return {
        ...atual,
        lancamentos: [
          { id: proximoLancamento, tipo: 'RECEITA', categoria: 'Serviços via Porto Seguro', descricao: 'Lote importado Porto Seguro', valor: 2860, data: '2026-07-24', veiculoId: 1, funcionarioId: 1, status: 'A_RECEBER', origem: 'Excel', protocolo: 'IMP-301' },
          { id: proximoLancamento + 1, tipo: 'DESPESA', categoria: 'Combustível', descricao: 'Abastecimento importado', valor: 890, data: '2026-07-24', veiculoId: 2, funcionarioId: 2, status: 'PAGO', origem: 'Excel', classeCusto: 'VARIAVEL', litros: 143 },
          { id: proximoLancamento + 2, tipo: 'DESPESA', categoria: 'Pedágio', descricao: 'Pedágios importados', valor: 185, data: '2026-07-24', veiculoId: 3, funcionarioId: 3, status: 'PAGO', origem: 'Excel', classeCusto: 'VARIAVEL' },
          ...atual.lancamentos,
        ],
        importacoes: [{
          id: Math.max(0, ...atual.importacoes.map(item => item.id)) + 1,
          arquivo: nomeArquivo,
          data: new Date().toISOString(),
          linhas,
          status: 'SIMULADO',
        }, ...atual.importacoes],
      }
    })
    return linhas
  }, [persistir])

  const restaurarDemo = useCallback(() => {
    const novosDados = clonarDados()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(novosDados))
    setState(novosDados)
  }, [])

  const valor = useMemo(() => ({
    state, adicionarLancamento, adicionarQuilometragem, adicionarVeiculo,
    adicionarFuncionario, atualizarStatusLancamento, importarExemplo, restaurarDemo,
  }), [state, adicionarLancamento, adicionarQuilometragem, adicionarVeiculo, adicionarFuncionario, atualizarStatusLancamento, importarExemplo, restaurarDemo])

  return <DemoContext.Provider value={valor}>{children}</DemoContext.Provider>
}

export function useDemo() {
  const contexto = useContext(DemoContext)
  if (!contexto) throw new Error('DemoProvider ausente')
  return contexto
}
