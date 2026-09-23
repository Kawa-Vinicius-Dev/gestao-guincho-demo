import { render,screen,within } from '@testing-library/react'
import { http,HttpResponse } from 'msw'
import { expect,test } from 'vitest'
import DashboardPage from '../DashboardPage'
import { servidor } from '../test/servidor'
import { MemoryRouter } from 'react-router-dom'
import type { Dashboard } from '../types/modelos'
import { invalidarCacheFinanceiro } from '../dados/dashboard'

/** Numeros da primeira OP real: 275 servicos, R$ 74.770,00, nenhuma despesa lancada. */
const dashboard=(extra:Partial<Dashboard>={}):Dashboard=>({
  receitaRecebida:74770,receitaPrevista:0,totalAtrasado:0,despesasPagas:0,despesasPrevistas:0,
  saldoRealizado:74770,saldoProjetado:74770,registrosImportados:275,quilometragemTotal:0,
  kmRemunerado:0,kmMorto:0,custoKmMorto:0,producaoPaga:74770,comissaoSobreProducao:14954,
  producaoPendente:0,servicosDoPeriodo:275,servicosPendentes:0,comissaoAPagar:14166.28,
  resultadoPorVeiculo:[],despesasPorCategoria:[],despesasAcumuladasPorDia:[],
  resultadoPorSocorrista:[
    {motoristaId:1,socorrista:'JEFERSON MARTINS DA SILVA',servicos:49,producao:23853.12,comissao:4770.62,despesas:0,custoTotal:4770.62},
    {motoristaId:9,socorrista:'ANDERSON JORGE RIBEIRO',servicos:85,producao:19864.11,comissao:3972.82,despesas:0,custoTotal:3972.82},
    {motoristaId:2,socorrista:'QEBSON RAMOS DA SILVA',servicos:75,producao:18787.95,comissao:3757.59,despesas:0,custoTotal:3757.59},
    {motoristaId:4,socorrista:'NATANAEL JOSE DE FREITAS NETO',servicos:50,producao:8326.2,comissao:1665.24,despesas:0,custoTotal:1665.24},
  ],
  ...extra,
})

function servidorDaVisao(dados:Dashboard){
  servidor.use(
    http.get('/api/dashboard',()=>HttpResponse.json(dados)),
    http.get('/api/porto/ordens-pagamento/resumo',()=>HttpResponse.json(null)),
  )
}

test('o lucro operacional abre a tela, com receita e despesa ao lado',async()=>{
  servidorDaVisao(dashboard({despesasPagas:20000,saldoRealizado:54770}))
  render(<MemoryRouter><DashboardPage/></MemoryRouter>)

  const resultado=await screen.findByRole('region',{name:/resultado do período/i})
  expect(await within(resultado).findByText('Lucro')).toBeInTheDocument()
  expect(within(resultado).getByText('R$ 54.770,00')).toBeInTheDocument()
  expect(within(resultado).getByText(/Margem de 73,3%/)).toBeInTheDocument()
  expect(within(resultado).getByText('R$ 74.770,00')).toBeInTheDocument()
  expect(within(resultado).getByText('R$ 20.000,00')).toBeInTheDocument()
  expect(within(resultado).getByText('Receitas')).toBeInTheDocument()
  expect(within(resultado).getByText('Despesas')).toBeInTheDocument()
  expect(within(resultado).getByText('26,7% das receitas')).toBeInTheDocument()
})

// Na Porto a OP chega paga e o painel do dia nasce sem valor: "a receber" zerado
// seria um numero morto. Ele so aparece quando existe dinheiro previsto de fato.
test('a receber só aparece quando existe',async()=>{
  servidorDaVisao(dashboard())
  render(<MemoryRouter><DashboardPage/></MemoryRouter>)

  const resultado=await screen.findByRole('region',{name:/resultado do período/i})
  await within(resultado).findByText('Lucro')
  expect(within(resultado).queryByText('A receber')).not.toBeInTheDocument()
})

test('lucro negativo fica em vermelho',async()=>{
  servidorDaVisao(dashboard({receitaRecebida:1000,despesasPagas:1500,saldoRealizado:-500}))
  render(<MemoryRouter><DashboardPage/></MemoryRouter>)

  const lucro=await screen.findByText('-R$ 500,00')
  expect(lucro).toHaveClass('destaque-negativo')
})

// A comissao vira despesa paga sozinha quando a OP chega: "a pagar" nao existe.
test('a barra mostra os serviços, sem comissão a pagar',async()=>{
  servidorDaVisao(dashboard())
  render(<MemoryRouter><DashboardPage/></MemoryRouter>)

  expect(await screen.findByText('Serviços')).toBeInTheDocument()
  expect(screen.getByText('275')).toBeInTheDocument()
  // Total das comissoes da equipe: soma dos quatro socorristas.
  expect(screen.getByText('Comissões')).toBeInTheDocument()
  expect(screen.getByText(/^R\$\s14\.166,27$/)).toBeInTheDocument()
  expect(screen.queryByText(/comissão a pagar/i)).not.toBeInTheDocument()
  // Despesa a pagar zerada nao vira cartao.
  expect(screen.queryByText('Despesas a pagar')).not.toBeInTheDocument()
})

// A soma das barras fecha com o que foi pago: o que nao tem socorrista ou viatura
// vinculados aparece na ultima linha, em vez de sumir.
test('km só aparece quando há km registrado',async()=>{
  servidorDaVisao(dashboard())
  const {unmount}=render(<MemoryRouter><DashboardPage/></MemoryRouter>)
  await screen.findByText('Serviços')
  expect(screen.queryByText(/km rodado × km morto/i)).not.toBeInTheDocument()
  unmount()
  // O mesmo periodo ficaria no cache de 60s; a segunda leitura precisa ir ao servidor.
  invalidarCacheFinanceiro()

  servidorDaVisao(dashboard({kmRemunerado:320,kmMorto:80,custoKmMorto:136,quilometragemTotal:400}))
  render(<MemoryRouter><DashboardPage/></MemoryRouter>)
  expect(await screen.findByText(/km rodado × km morto/i)).toBeInTheDocument()
})

// O resumo "Faturamento separado do caixa" repetia o recebido e mostrava um
// "programado" que nao existe quando a OP chega paga. A nota de calculo dizia
// que a OP contava pelo recebimento; ela conta no periodo da OP.
test('sem resumo Porto duplicado e com a regra de período certa',async()=>{
  servidorDaVisao(dashboard())
  render(<MemoryRouter><DashboardPage/></MemoryRouter>)

  await screen.findByText('Serviços')
  expect(screen.queryByText(/faturamento separado do caixa/i)).not.toBeInTheDocument()
  expect(screen.getByText(/conta na OP em que entrou; até 8 dias,\s+conta na data do atendimento/)).toBeInTheDocument()
  expect(screen.queryByText(/vem do recebimento/)).not.toBeInTheDocument()
})
