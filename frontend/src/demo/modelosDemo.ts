export type TipoLancamento = 'RECEITA' | 'DESPESA'
export type StatusLancamento = 'RECEBIDO' | 'A_RECEBER' | 'PAGO' | 'PENDENTE'
export type ClasseCusto = 'VARIAVEL' | 'FIXO'
export type OrigemLancamentoDemo = 'Manual' | 'Banco' | 'Porto Seguro' | 'Outra seguradora' | 'Excel'

export interface VeiculoDemo {
  id: number
  codigo: string
  placa: string
  modelo: string
  status: 'ATIVO' | 'MANUTENCAO' | 'INATIVO'
  quilometragemAtual: number
  custoPorKm: number
  metaReceita: number
  metaKmMorto: number
  metaMargem: number
}

export interface FuncionarioDemo {
  id: number
  nome: string
  funcao: string
  veiculoId?: number
  status: 'EM_SERVICO' | 'DISPONIVEL' | 'FOLGA'
  metaReceita: number
  metaKmMorto: number
  metaMargem: number
}

export interface LancamentoDemo {
  id: number
  tipo: TipoLancamento
  categoria: string
  descricao: string
  valor: number
  data: string
  veiculoId?: number
  funcionarioId?: number
  status: StatusLancamento
  origem: OrigemLancamentoDemo
  contratanteFonte?: 'Porto Seguro' | 'Outra seguradora' | 'Cliente particular' | 'Empresa contratante' | 'Outros'
  classeCusto?: ClasseCusto
  protocolo?: string
  litros?: number
}

export interface QuilometragemDemo {
  id: number
  veiculoId: number
  funcionarioId?: number
  data: string
  kmRodado: number
  kmMorto: number
  custoPorKm: number
  motivo: string
}

export interface EscalaDemo {
  id: number
  dia: string
  funcionarioId: number
  veiculoId: number
  turno: 'DIURNO' | 'NOTURNO' | 'COMERCIAL'
  status: 'CONFIRMADA' | 'PLANTAO' | 'FOLGA'
}

export interface ImportacaoDemo {
  id: number
  arquivo: string
  data: string
  linhas: number
  status: 'IMPORTADO' | 'SIMULADO'
}

export interface DemoState {
  veiculos: VeiculoDemo[]
  funcionarios: FuncionarioDemo[]
  lancamentos: LancamentoDemo[]
  quilometragens: QuilometragemDemo[]
  escala: EscalaDemo[]
  importacoes: ImportacaoDemo[]
}

export interface ResultadoVeiculoDemo {
  veiculo: VeiculoDemo
  receita: number
  despesas: number
  lucro: number
  margem: number
  kmRodado: number
  kmMorto: number
  percentualKmMorto: number
  combustivel: number
  manutencao: number
  seguro: number
  parcela: number
  custoKmMorto: number
  litros: number
  status: 'SAUDAVEL' | 'MONITORAR' | 'ATENCAO_KM' | 'PREJUIZO'
}

export interface ResumoMensalDemo {
  mes: string
  receita: number
  despesas: number
  lucro: number
  margem: number
  aReceber: number
  kmRodado: number
  kmMorto: number
  custoKmMorto: number
  percentualKmMorto: number
  resultadoVeiculos: ResultadoVeiculoDemo[]
}
