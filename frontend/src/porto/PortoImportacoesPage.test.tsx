import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import PortoImportacoesPage from '../pages/PortoImportacoesPage'
import { servidor } from '../test/servidor'

test('envia CSV, exige OP para relatório de OS e confirma a prévia', async () => {
  let ordemSelecionada: number | null = null
  servidor.use(
    http.get('/api/porto/ordens-pagamento', () => HttpResponse.json([{ id: 9, numero: 'OP-900', valorTotal: 1500, situacao: 'PROGRAMADO' }])),
    http.post('/api/porto/importacoes/previa', () => HttpResponse.json({
      id: 12, nomeArquivo: 'os.csv', tipo: 'OS_VINCULADAS', status: 'AGUARDANDO_CONFERENCIA', totalLinhas: 1,
      requerOrdemPagamento: true, erros: [], linhas: [{ hashRegistro: 'hash', dados: { numero_os: 'OS-901', valor_total: '700.00', especialidade: 'REMOÇÃO' } }],
    }, { status: 201 })),
    http.post('/api/porto/importacoes/12/avaliar', () => HttpResponse.json({
      id: 12, nomeArquivo: 'os.csv', tipo: 'OS_VINCULADAS', status: 'AGUARDANDO_CONFERENCIA', totalLinhas: 1,
      requerOrdemPagamento: true, erros: [], linhas: [{ hashRegistro: 'hash', acao: 'IMPORTAR', dados: { numero_os: 'OS-901', valor_total: '700.00', especialidade: 'REMOÇÃO' } }],
    })),
    http.post('/api/porto/importacoes/12/confirmar', async ({ request }) => {
      ordemSelecionada = Number((await request.json() as { ordemPagamentoId: number }).ordemPagamentoId)
      return HttpResponse.json({ importacaoId: 12, tipo: 'OS_VINCULADAS', importados: 1, ignorados: 0 })
    }),
  )
  const user=userEvent.setup()
  render(<PortoImportacoesPage />)
  const arquivo=new File(['Número da Ordem de Serviço;Valor Total\nOS-901;700'], 'os.csv', { type: 'text/csv' })
  await user.upload(screen.getByLabelText(/arquivo csv/i),arquivo)
  await user.click(screen.getByRole('button',{name:/analisar csv/i}))
  expect(await screen.findByText('OS-901')).toBeInTheDocument()
  expect(screen.getByText(/OS vinculadas à OP/i)).toBeInTheDocument()
  await user.selectOptions(screen.getByLabelText(/ordem de pagamento/i),'9')
  await user.click(screen.getByRole('button',{name:/confirmar importação/i}))
  expect(await screen.findByText(/1 registro importado/i)).toBeInTheDocument()
  expect(ordemSelecionada).toBe(9)
})

test('cancela uma prévia retomada e permite corrigir o arquivo', async()=>{
  servidor.use(
    http.get('/api/porto/ordens-pagamento',()=>HttpResponse.json([])),
    http.post('/api/porto/importacoes/previa',()=>HttpResponse.json({id:21,nomeArquivo:'retomada.csv',tipo:'PREVISAO_RECEBER',status:'AGUARDANDO_CONFERENCIA',totalLinhas:1,requerOrdemPagamento:false,erros:[],linhas:[{hashRegistro:'h21',acao:'IMPORTAR',dados:{numero_op:'OP-21',valor_total:'100,00',data_pagamento:'31/08/2026'}}]},{status:201})),
    http.post('/api/porto/importacoes/21/cancelar',()=>HttpResponse.json({id:21,nomeArquivo:'retomada.csv',tipo:'PREVISAO_RECEBER',status:'CANCELADA',totalLinhas:1,requerOrdemPagamento:false,erros:[],linhas:[{hashRegistro:'h21',acao:'IMPORTAR',dados:{numero_op:'OP-21'}}]})),
  )
  const user=userEvent.setup();render(<PortoImportacoesPage/>)
  await user.upload(screen.getByLabelText(/arquivo csv/i),new File(['csv'],'retomada.csv',{type:'text/csv'}))
  await user.click(screen.getByRole('button',{name:/analisar csv/i}))
  expect(await screen.findByText('OP-21')).toBeInTheDocument()
  await user.click(screen.getByRole('button',{name:/cancelar prévia/i}))
  expect(await screen.findByText(/prévia cancelada/i)).toBeInTheDocument()
  expect(screen.queryByText('OP-21')).not.toBeInTheDocument()
})

test('bloqueia erros e exige confirmação separada para divergência',async()=>{
  let avaliacao=0;let confirmouDivergencia=false
  servidor.use(
    http.get('/api/porto/ordens-pagamento',()=>HttpResponse.json([{id:31,numero:'OP-31',valorTotal:500,situacao:'PROGRAMADO'}])),
    http.post('/api/porto/importacoes/previa',()=>HttpResponse.json({id:31,nomeArquivo:'os.csv',tipo:'OS_VINCULADAS',status:'AGUARDANDO_CONFERENCIA',totalLinhas:1,requerOrdemPagamento:true,erros:['Linha 2: valor total vazio'],linhas:[{hashRegistro:'h31',acao:'ERRO',mensagem:'Linha 2: valor total vazio',dados:{numero_os:'OS-31',valor_total:''}}]},{status:201})),
    http.post('/api/porto/importacoes/31/avaliar',()=>{avaliacao++;return HttpResponse.json({id:31,nomeArquivo:'os.csv',tipo:'OS_VINCULADAS',status:'AGUARDANDO_CONFERENCIA',totalLinhas:1,requerOrdemPagamento:true,erros:[],linhas:[{hashRegistro:'h31',acao:'DIVERGENCIA',mensagem:'A OS já está vinculada a outra OP.',dados:{numero_os:'OS-31',valor_total:'300'}}]})}),
    http.post('/api/porto/importacoes/31/confirmar',async({request})=>{confirmouDivergencia=Boolean((await request.json() as {confirmarDivergencias:boolean}).confirmarDivergencias);return HttpResponse.json({importacaoId:31,tipo:'OS_VINCULADAS',importados:1,ignorados:0})}),
  )
  const user=userEvent.setup();render(<PortoImportacoesPage/>)
  const input=screen.getByLabelText(/arquivo csv/i)
  await user.upload(input,new File(['csv com erro'],'os.csv',{type:'text/csv'}));await user.click(screen.getByRole('button',{name:/analisar csv/i}))
  expect(await screen.findByText(/corrija e reenvie/i)).toBeInTheDocument()
  expect(screen.getByRole('button',{name:/confirmar importação/i})).toBeDisabled()

  await user.upload(input,new File(['csv corrigido'],'os.csv',{type:'text/csv'}));await user.click(screen.getByRole('button',{name:/analisar csv/i}))
  await user.selectOptions(await screen.findByLabelText(/ordem de pagamento/i),'31')
  expect(await screen.findByText(/já está vinculada a outra OP/i)).toBeInTheDocument()
  expect(avaliacao).toBe(1)
  expect(screen.getByRole('button',{name:/confirmar importação/i})).toBeDisabled()
  await user.click(screen.getByLabelText(/confirmo a reassociação/i))
  await user.click(screen.getByRole('button',{name:/confirmar importação/i}))
  expect(await screen.findByText(/1 registro importado/i)).toBeInTheDocument()
  expect(confirmouDivergencia).toBe(true)
})
