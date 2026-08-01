import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import PortoDashboardPage from '../pages/PortoDashboardPage'
import { servidor } from '../test/servidor'

test('separa realizado, programado e recebido no dashboard Porto',async()=>{
  let numeroOs=''
  servidor.use(http.get('/api/porto/dashboard',({request})=>{numeroOs=new URL(request.url).searchParams.get('numeroOs')??'';return HttpResponse.json({
    quantidadeTotalOps:10,valorTotalPrevisto:5000,quantidadeSemComposicao:2,valorSemComposicao:800,quantidadeConciliadas:6,valorConciliadas:3000,quantidadeValorAbaixo:1,diferencaTotalAbaixo:100,quantidadeValorAcima:1,diferencaTotalAcima:50,quantidadeComDivergencia:2,valorTotalDivergencias:150,quantidadePagamentoProgramado:10,valorProgramado:5000,quantidadeRecebidas:4,valorRecebido:1800,quantidadeAguardandoRecebimento:6,valorAguardandoRecebimento:3200,quantidadeVencidasNaoRecebidas:1,valorVencidoNaoRecebido:500,valorMedioPorOp:500,quantidadeOrdensServico:245,
    quantidadeTotalServicos:245,valorTotalRealizado:6200,quantidadeAguardandoOp:35,valorAguardandoOp:900,quantidadeServicosPagamentoProgramado:180,valorServicosPagamentoProgramado:4500,valorPrevistoAReceber:5000,valorConciliado:3000,valorEfetivamenteRecebido:1800,quantidadeServicosPendentes:3,valorServicosPendentes:250,quantidadeServicosDevolvidos:2,
    porEspecialidade:[{chave:'REMOÇÃO',quantidade:120,valor:3500}],porSocorrista:[{chave:'SOCORRISTA TESTE',quantidade:80,valor:2100}],evolucaoDiaria:[],evolucaoMensal:[],
  })}))
  const user=userEvent.setup();render(<PortoDashboardPage/>);expect(await screen.findByText('Realizado')).toBeInTheDocument()
  expect(screen.getByText('Programado')).toBeInTheDocument();expect(screen.getByText('Recebido')).toBeInTheDocument();expect(screen.getByText('245')).toBeInTheDocument();expect(screen.getByText('REMOÇÃO')).toBeInTheDocument()
  await user.type(screen.getByLabelText(/número da os/i),'OS-TESTE');await user.click(screen.getByRole('button',{name:/aplicar filtros/i}));expect(numeroOs).toBe('OS-TESTE')
})
