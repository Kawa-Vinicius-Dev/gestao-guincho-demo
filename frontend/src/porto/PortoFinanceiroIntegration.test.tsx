import { render,screen,within } from '@testing-library/react'
import { http,HttpResponse } from 'msw'
import { expect,test } from 'vitest'
import DashboardPage from '../DashboardPage'
import { servidor } from '../test/servidor'
import { MemoryRouter } from 'react-router-dom'

test('mostra a receita da OP paga na visão geral usando o dashboard real',async()=>{
  servidor.use(
    http.get('/api/dashboard',()=>HttpResponse.json({receitaRecebida:1000,receitaPrevista:0,totalAtrasado:0,despesasPagas:200,despesasPrevistas:0,saldoRealizado:800,saldoProjetado:800,registrosImportados:1,quilometragemTotal:0,kmRemunerado:0,kmMorto:0,custoKmMorto:0,resultadoPorVeiculo:[]})),
    http.get('/api/porto/ordens-pagamento/resumo',()=>HttpResponse.json({quantidadeTotalOps:2,valorTotalPrevisto:900,quantidadeSemComposicao:1,valorSemComposicao:400,quantidadeConciliadas:1,valorConciliadas:500,quantidadeComDivergencia:0,valorTotalDivergencias:0,quantidadePagamentoProgramado:2,valorProgramado:900,quantidadeRecebidas:0,valorRecebido:0,quantidadeAguardandoRecebimento:2,valorAguardandoRecebimento:900,quantidadeVencidasNaoRecebidas:0,valorVencidoNaoRecebido:0,valorMedioPorOp:450,quantidadeOrdensServico:3})),
  )
  render(<MemoryRouter><DashboardPage/></MemoryRouter>)
  const caixa=await screen.findByRole('region',{name:/indicadores do período/i});expect(within(caixa).getByText('R$ 1.000,00')).toBeInTheDocument();expect(within(caixa).getByText('R$ 200,00')).toBeInTheDocument();expect(within(caixa).getByText('R$ 800,00')).toBeInTheDocument()
  const porto=await screen.findByRole('region',{name:/faturamento porto/i});expect(within(porto).getAllByText(/R\$\s*900,00/)).toHaveLength(2);expect(within(porto).getByText(/não compõem o caixa/i)).toBeInTheDocument()
})

// A Porto paga semanas depois do servico. Quem olhava o mes do atendimento via
// receita zero e concluia que a importacao falhou — tres vezes na operacao. A
// tela passa a dizer onde o dinheiro esta, em vez de so nao mostra-lo.
test('avisa onde caiu o dinheiro dos serviços pagos fora da janela',async()=>{
  servidor.use(
    http.get('/api/dashboard',()=>HttpResponse.json({receitaRecebida:0,receitaPrevista:0,totalAtrasado:0,
      despesasPagas:0,despesasPrevistas:0,saldoRealizado:0,saldoProjetado:0,registrosImportados:2,
      quilometragemTotal:0,kmRemunerado:0,kmMorto:0,custoKmMorto:0,resultadoPorVeiculo:[],
      recebimentosForaDoPeriodo:[{dataPagamento:'2026-08-28',valor:59246.5,servicos:248}]})),
  )
  render(<MemoryRouter><DashboardPage/></MemoryRouter>)

  const aviso=await screen.findByRole('status',{name:/recebimento fora do período/i})
  expect(within(aviso).getByText(/59\.246,50/)).toBeInTheDocument()
  expect(within(aviso).getByText('28/08/2026')).toBeInTheDocument()
  expect(aviso).toHaveTextContent(/248 serviços prestados/i)
})

test('sem pagamento fora da janela não há aviso nenhum',async()=>{
  servidor.use(http.get('/api/dashboard',()=>HttpResponse.json({receitaRecebida:500,receitaPrevista:0,
    totalAtrasado:0,despesasPagas:0,despesasPrevistas:0,saldoRealizado:500,saldoProjetado:500,
    registrosImportados:0,quilometragemTotal:0,kmRemunerado:0,kmMorto:0,custoKmMorto:0,
    resultadoPorVeiculo:[],recebimentosForaDoPeriodo:[]})))
  render(<MemoryRouter><DashboardPage/></MemoryRouter>)

  await screen.findByRole('region',{name:/indicadores do período/i})
  expect(screen.queryByRole('status',{name:/recebimento fora do período/i})).not.toBeInTheDocument()
})
