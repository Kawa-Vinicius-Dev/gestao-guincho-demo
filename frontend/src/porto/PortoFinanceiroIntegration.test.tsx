import { render,screen,within } from '@testing-library/react'
import { http,HttpResponse } from 'msw'
import { expect,test } from 'vitest'
import DashboardPage from '../pages/DashboardPage'
import { DemoProvider } from '../demo/DemoContext'
import { servidor } from '../test/servidor'
import { MemoryRouter } from 'react-router-dom'

test('mostra a receita da OP paga na visão geral usando o dashboard real',async()=>{
  servidor.use(
    http.get('/api/dashboard',()=>HttpResponse.json({receitaRecebida:1000,receitaPrevista:0,totalReceber:0,totalAtrasado:0,despesasPagas:200,despesasPrevistas:0,saldoRealizado:800,saldoProjetado:800,lucroEstimado:800,registrosImportados:1,quilometragemTotal:0,kmRemunerado:0,kmMorto:0,custoKmMorto:0,resultadoPorVeiculo:[]})),
    http.get('/api/porto/ordens-pagamento/resumo',()=>HttpResponse.json({quantidadeTotalOps:2,valorTotalPrevisto:900,quantidadeSemComposicao:1,valorSemComposicao:400,quantidadeConciliadas:1,valorConciliadas:500,quantidadeComDivergencia:0,valorTotalDivergencias:0,quantidadePagamentoProgramado:2,valorProgramado:900,quantidadeRecebidas:0,valorRecebido:0,quantidadeAguardandoRecebimento:2,valorAguardandoRecebimento:900,quantidadeVencidasNaoRecebidas:0,valorVencidoNaoRecebido:0,valorMedioPorOp:450,quantidadeOrdensServico:3})),
  )
  render(<MemoryRouter><DemoProvider><DashboardPage/></DemoProvider></MemoryRouter>)
  const caixa=await screen.findByRole('region',{name:/fluxo do resultado operacional/i});expect(within(caixa).getByText('R$ 1.000,00')).toBeInTheDocument();expect(within(caixa).getByText('R$ 200,00')).toBeInTheDocument();expect(within(caixa).getByText('R$ 800,00')).toBeInTheDocument()
  const porto=await screen.findByRole('region',{name:/faturamento porto/i});expect(within(porto).getAllByText(/R\$\s*900,00/)).toHaveLength(2);expect(within(porto).getByText(/não compõem o caixa/i)).toBeInTheDocument()
})
