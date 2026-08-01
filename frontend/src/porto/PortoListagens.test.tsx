import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, test, vi } from 'vitest'
import PortoOrdensPagamentoPage from '../pages/PortoOrdensPagamentoPage'
import PortoOrdensServicoPage from '../pages/PortoOrdensServicoPage'
import PortoPendenciasPage from '../pages/PortoPendenciasPage'
import { servidor } from '../test/servidor'

test('confirma recebimento manual de OP programada', async()=>{
  let recebida=false
  servidor.use(
    http.get('/api/porto/ordens-pagamento',()=>HttpResponse.json([{id:1,numero:'OP-100',valorTotal:1500,dataPagamentoProgramada:'2026-08-15',situacao:recebida?'RECEBIDO':'PROGRAMADO',...(recebida&&{valorRecebido:1490,dataRecebimento:'2026-08-16'})}])),
    http.patch('/api/porto/ordens-pagamento/1/receber',()=>{recebida=true;return HttpResponse.json({id:1,numero:'OP-100',valorTotal:1500,valorRecebido:1490,dataRecebimento:'2026-08-16',situacao:'RECEBIDO'})}),
  )
  const user=userEvent.setup();render(<PortoOrdensPagamentoPage/>)
  expect(await screen.findByText('Programado')).toBeInTheDocument()
  await user.click(screen.getByRole('button',{name:/confirmar recebimento/i}))
  await user.clear(screen.getByLabelText(/valor recebido/i));await user.type(screen.getByLabelText(/valor recebido/i),'1490')
  await user.click(screen.getByRole('button',{name:/salvar recebimento/i}))
  expect(await screen.findByText('Recebido')).toBeInTheDocument()
})

test('lista OS com OP e aceita viatura vazia',async()=>{
  servidor.use(http.get('/api/porto/ordens-servico',()=>HttpResponse.json([{id:2,ordemPagamentoId:1,ordemPagamento:'OP-100',numero:'OS-200',valorTotal:700,especialidade:'REMOÇÃO',socorrista:'Ana',qra:'QRA-1',dataAtendimento:'2026-07-30'}])))
  render(<PortoOrdensServicoPage/>);expect(await screen.findByText('OS-200')).toBeInTheDocument();expect(screen.getByText('OP-100')).toBeInTheDocument();expect(screen.getByText('Sem viatura')).toBeInTheDocument()
})

test('lista serviço devolvido como pendência financeira',async()=>{
  servidor.use(http.get('/api/porto/pendencias',()=>HttpResponse.json([{tipo:'SERVICO_DEVOLVIDO',referenciaId:2,referencia:'OS-200',valor:700,data:'2026-07-31',situacao:'ABERTA'}])))
  render(<PortoPendenciasPage/>);expect(await screen.findByText('Serviço devolvido')).toBeInTheDocument();expect(screen.getByText('OS-200')).toBeInTheDocument();expect(screen.queryByText(/despesa/i)).not.toBeInTheDocument()
})

test('resume e filtra OPs recalculando quantidade e valores',async()=>{
  let numeroFiltrado=''
  servidor.use(
    http.get('/api/porto/ordens-pagamento',({request})=>{numeroFiltrado=new URL(request.url).searchParams.get('numero')??'';return HttpResponse.json([{id:71,numero:'OP-701',valorTotal:500,dataPagamentoProgramada:'2026-08-15',situacao:'PROGRAMADO',quantidadeOrdensServico:2,valorOrdensServico:450,divergencia:50,statusConciliacao:'VALOR_ABAIXO'}])}),
    http.get('/api/porto/ordens-pagamento/resumo',()=>HttpResponse.json({quantidadeTotalOps:1,valorTotalPrevisto:500,quantidadeSemComposicao:0,valorSemComposicao:0,quantidadeConciliadas:0,valorConciliadas:0,quantidadeValorAbaixo:1,diferencaTotalAbaixo:50,quantidadeValorAcima:0,diferencaTotalAcima:0,quantidadeComDivergencia:1,valorTotalDivergencias:50,quantidadePagamentoProgramado:1,valorProgramado:500,quantidadeRecebidas:0,valorRecebido:0,quantidadeAguardandoRecebimento:1,valorAguardandoRecebimento:500,quantidadeVencidasNaoRecebidas:0,valorVencidoNaoRecebido:0,valorMedioPorOp:500,quantidadeOrdensServico:2})),
  )
  const user=userEvent.setup();render(<PortoOrdensPagamentoPage/>);expect(await screen.findByText('OP-701')).toBeInTheDocument()
  expect(screen.getByText('Total de OPs')).toBeInTheDocument();expect(screen.getByText('Valor médio por OP')).toBeInTheDocument()
  expect(screen.getByRole('columnheader',{name:/soma das os/i})).toBeInTheDocument()
  await user.type(screen.getByLabelText(/número da op/i),'OP-701');await user.click(screen.getByRole('button',{name:/aplicar filtros/i}))
  expect(numeroFiltrado).toBe('OP-701')
})

test('filtra ordens de serviço por campos operacionais',async()=>{
  let especialidade=''
  servidor.use(http.get('/api/porto/ordens-servico',({request})=>{especialidade=new URL(request.url).searchParams.get('especialidade')??'';return HttpResponse.json([{id:82,numero:'OS-820',valorTotal:320,especialidade:'PANE',dataAtendimento:'2026-08-01',statusOperacional:'NORMAL',statusFinanceiro:'AGUARDANDO_OP'}])}))
  const user=userEvent.setup();render(<PortoOrdensServicoPage/>);expect(await screen.findByText('OS-820')).toBeInTheDocument()
  await user.type(screen.getByLabelText(/especialidade/i),'PANE');await user.click(screen.getByRole('button',{name:/aplicar filtros/i}));expect(especialidade).toBe('PANE')
  expect(screen.getByText('Aguardando op')).toBeInTheDocument()
})

test('solicita Excel e PDF com os filtros ativos',async()=>{
  let excel=0,pdf=0
  const clique=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{})
  Object.defineProperty(URL,'createObjectURL',{configurable:true,value:vi.fn(()=> 'blob:teste')});Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:vi.fn()})
  servidor.use(
    http.get('/api/porto/ordens-pagamento',()=>HttpResponse.json([])),
    http.get('/api/porto/ordens-pagamento/resumo',()=>HttpResponse.json({quantidadeTotalOps:0,valorTotalPrevisto:0,quantidadeSemComposicao:0,valorSemComposicao:0,quantidadeConciliadas:0,valorConciliadas:0,quantidadeValorAbaixo:0,diferencaTotalAbaixo:0,quantidadeValorAcima:0,diferencaTotalAcima:0,quantidadeComDivergencia:0,valorTotalDivergencias:0,quantidadePagamentoProgramado:0,valorProgramado:0,quantidadeRecebidas:0,valorRecebido:0,quantidadeAguardandoRecebimento:0,valorAguardandoRecebimento:0,quantidadeVencidasNaoRecebidas:0,valorVencidoNaoRecebido:0,valorMedioPorOp:0,quantidadeOrdensServico:0})),
    http.get('/api/porto/relatorios/excel',()=>{excel++;return new HttpResponse(new Uint8Array([1]),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}})}),
    http.get('/api/porto/relatorios/pdf',()=>{pdf++;return new HttpResponse(new Uint8Array([1]),{headers:{'Content-Type':'application/pdf'}})}),
  )
  const user=userEvent.setup();render(<PortoOrdensPagamentoPage/>);await screen.findByText('Nenhuma OP')
  await user.click(screen.getByRole('button',{name:/exportar excel/i}));await user.click(screen.getByRole('button',{name:/exportar pdf/i}))
  expect(excel).toBe(1);expect(pdf).toBe(1);clique.mockRestore()
})

test('mostra erro quando a exportação falha',async()=>{
  servidor.use(http.get('/api/porto/ordens-pagamento',()=>HttpResponse.json([])),http.get('/api/porto/relatorios/excel',()=>new HttpResponse(null,{status:500})))
  const user=userEvent.setup();render(<PortoOrdensPagamentoPage/>);await screen.findByText('Nenhuma OP');await user.click(screen.getByRole('button',{name:/exportar excel/i}))
  expect(await screen.findByText(/não foi possível exportar o relatório Porto/i)).toBeInTheDocument()
})

test('abre a composição da OP e registra justificativa',async()=>{
  let justificou=false
  const op={id:91,numero:'OP-DET-91',valorTotal:500,dataPagamentoProgramada:'2026-08-31',situacao:'PROGRAMADO',quantidadeOrdensServico:1,valorOrdensServico:450,divergencia:50,statusConciliacao:'VALOR_ABAIXO'}
  servidor.use(
    http.get('/api/porto/ordens-pagamento',()=>HttpResponse.json([op])),
    http.get('/api/porto/ordens-pagamento/91',()=>HttpResponse.json({ordemPagamento:op,ordensServico:[{id:92,numero:'OS-DET-92',valorTotal:450,especialidade:'PANE',dataAtendimento:'2026-08-01',statusOperacional:'NORMAL',statusFinanceiro:'PAGAMENTO_PROGRAMADO'}],justificativas:justificou?[{id:1,motivo:'DESCONTO',observacao:'Justificativa sintética',usuario:'Administrador',criadoEm:'2026-08-01T10:00:00Z'}]:[]})),
    http.post('/api/porto/ordens-pagamento/91/justificativas',()=>{justificou=true;return HttpResponse.json({id:1,motivo:'DESCONTO',observacao:'Justificativa sintética',usuario:'Administrador',criadoEm:'2026-08-01T10:00:00Z'},{status:201})}),
  )
  const user=userEvent.setup();render(<PortoOrdensPagamentoPage/>);await user.click(await screen.findByRole('button',{name:'OP-DET-91'}));expect(await screen.findByText('OS-DET-92')).toBeInTheDocument()
  await user.selectOptions(screen.getByLabelText(/motivo/i),'DESCONTO');await user.type(screen.getByLabelText(/observação/i),'Justificativa sintética');await user.click(screen.getByRole('button',{name:/registrar justificativa/i}));expect(justificou).toBe(true)
})
