import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
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
