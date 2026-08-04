import { render,screen,within } from '@testing-library/react'
import { http,HttpResponse } from 'msw'
import { expect,test } from 'vitest'
import DashboardPage from '../pages/DashboardPage'
import { DemoProvider } from '../demo/DemoContext'
import { servidor } from '../test/servidor'
import { MemoryRouter } from 'react-router-dom'

test('mostra faturamento Porto separado sem inflar o caixa da demo',async()=>{
  servidor.use(http.get('/api/porto/ordens-pagamento/resumo',()=>HttpResponse.json({quantidadeTotalOps:2,valorTotalPrevisto:900,quantidadeSemComposicao:1,valorSemComposicao:400,quantidadeConciliadas:1,valorConciliadas:500,quantidadeComDivergencia:0,valorTotalDivergencias:0,quantidadePagamentoProgramado:2,valorProgramado:900,quantidadeRecebidas:0,valorRecebido:0,quantidadeAguardandoRecebimento:2,valorAguardandoRecebimento:900,quantidadeVencidasNaoRecebidas:0,valorVencidoNaoRecebido:0,valorMedioPorOp:450,quantidadeOrdensServico:3})))
  render(<MemoryRouter><DemoProvider><DashboardPage/></DemoProvider></MemoryRouter>)
  const caixa=screen.getByRole('region',{name:/fluxo do resultado operacional/i});expect(within(caixa).getAllByText('R$ 0,00')).toHaveLength(3)
  const porto=await screen.findByRole('region',{name:/faturamento porto/i});expect(within(porto).getAllByText(/R\$\s*900,00/)).toHaveLength(2);expect(within(porto).getByText(/não compõem o caixa/i)).toBeInTheDocument()
})
