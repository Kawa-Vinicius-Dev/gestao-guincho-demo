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
      return HttpResponse.json({ importacaoId: 12, tipo: 'OS_VINCULADAS', importados: 1, ignorados: 0, novos: 1, atualizados: 0,
        receitasCriadas: 1, receitasAtualizadas: 0, valorTotalRecebido: 700, quinzena: '01/07/2026 a 15/07/2026', dataPagamento: '2026-08-14', erros: [] })
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
  await user.selectOptions(screen.getByLabelText(/período financeiro/i),'1')
  const acoes=screen.getByRole('contentinfo',{name:/ações da prévia/i}),tabela=screen.getByRole('table')
  expect(acoes.compareDocumentPosition(tabela)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  await user.click(screen.getByRole('button',{name:/confirmar importação/i}))
  expect(await screen.findByText(/1 registro importado/i)).toBeInTheDocument()
  expect(screen.getByText(/1 receita criada/i)).toBeInTheDocument()
  expect(screen.getByText(/R\$\s*700,00 recebidos/i)).toBeInTheDocument()
  expect(screen.getByText(/01\/07\/2026 a 15\/07\/2026/i)).toBeInTheDocument()
  expect(screen.getByText(/14\/08\/2026/i)).toBeInTheDocument()
  expect(ordemSelecionada).toBe(9)
})

test('cancela uma prévia retomada e permite corrigir o arquivo', async()=>{
  servidor.use(
    http.get('/api/porto/ordens-pagamento',()=>HttpResponse.json([])),
    http.post('/api/porto/importacoes/previa',()=>HttpResponse.json({id:21,nomeArquivo:'retomada.csv',tipo:'PREVISAO_RECEBER',status:'AGUARDANDO_CONFERENCIA',totalLinhas:3,requerOrdemPagamento:false,erros:[],resumo:{linhasAnalisadas:3,opsUnicas:2,registrosNovos:1,registrosExistentes:1,registrosAtualizados:1,duplicidades:1,erros:0,valorTotal:300},linhas:[{hashRegistro:'h21',acao:'IMPORTAR',dados:{numero_op:'OP-21',valor_total:'100,00',data_pagamento:'31/08/2026'}}]},{status:201})),
    http.post('/api/porto/importacoes/21/cancelar',()=>HttpResponse.json({id:21,nomeArquivo:'retomada.csv',tipo:'PREVISAO_RECEBER',status:'CANCELADA',totalLinhas:1,requerOrdemPagamento:false,erros:[],linhas:[{hashRegistro:'h21',acao:'IMPORTAR',dados:{numero_op:'OP-21'}}]})),
  )
  const user=userEvent.setup();render(<PortoImportacoesPage/>)
  await user.upload(screen.getByLabelText(/arquivo csv/i),new File(['csv'],'retomada.csv',{type:'text/csv'}))
  await user.click(screen.getByRole('button',{name:/analisar csv/i}))
  expect(await screen.findByText('OP-21')).toBeInTheDocument()
  expect(screen.getByText((_,element)=>element?.tagName==='SPAN'&&element.textContent==='2 OPs únicas')).toBeInTheDocument()
  expect(screen.getByText((_,element)=>element?.tagName==='SPAN'&&element.textContent==='1 registro atualizado')).toBeInTheDocument()
  expect(screen.getByText((_,element)=>element?.tagName==='SPAN'&&element.textContent==='0 erros')).toBeInTheDocument()
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
  await user.selectOptions(screen.getByLabelText(/período financeiro/i),'1')
  expect(await screen.findByText(/já está vinculada a outra OP/i)).toBeInTheDocument()
  expect(avaliacao).toBe(1)
  expect(screen.getByRole('button',{name:/confirmar importação/i})).toBeDisabled()
  await user.click(screen.getByLabelText(/confirmo a reassociação/i))
  await user.click(screen.getByRole('button',{name:/confirmar importação/i}))
  expect(await screen.findByText(/1 registro importado/i)).toBeInTheDocument()
  expect(confirmouDivergencia).toBe(true)
})

test('cola serviços, mostra resumo da prévia e confirma somente depois da análise',async()=>{
  let conteudoRecebido='',confirmacao:Record<string,unknown>|null=null
  servidor.use(
    http.get('/api/porto/ordens-pagamento',()=>HttpResponse.json([{id:45,numero:'OP-GERAL-PAGA',valorTotal:300.75,situacao:'PROGRAMADO'}])),
    http.post('/api/porto/importacoes/previa-conteudo',async({request})=>{
      conteudoRecebido=String((await request.json() as {conteudo:string}).conteudo)
      return HttpResponse.json({id:44,nomeArquivo:'colagem-servicos-porto.txt',tipo:'SERVICOS_GERAIS',status:'AGUARDANDO_CONFERENCIA',totalLinhas:2,requerOrdemPagamento:true,erros:[],
        resumo:{linhasAnalisadas:2,opsUnicas:0,registrosNovos:2,registrosExistentes:0,registrosAtualizados:0,duplicidades:0,erros:0,valorTotal:300.75},
        linhas:[
          {hashRegistro:'c1',acao:'IMPORTAR',dados:{numero_os:'OS 01/0000001-26',valor_total:'100,50',especialidade:'REMOÇÃO',data_atendimento:'2026-08-01 10:30:00'}},
          {hashRegistro:'c2',acao:'IMPORTAR',dados:{numero_os:'OS 01/0000002-26',valor_total:'200.25',especialidade:'PANE',data_atendimento:'2026-08-01 11:00:00'}},
        ]},{status:201})
    }),
    http.post('/api/porto/importacoes/44/avaliar',()=>HttpResponse.json({id:44,nomeArquivo:'colagem-servicos-porto.txt',tipo:'SERVICOS_GERAIS',status:'AGUARDANDO_CONFERENCIA',totalLinhas:2,requerOrdemPagamento:true,erros:[],
      resumo:{linhasAnalisadas:2,opsUnicas:0,registrosNovos:2,registrosExistentes:0,registrosAtualizados:0,duplicidades:0,erros:0,valorTotal:300.75},
      linhas:[
        {hashRegistro:'c1',acao:'IMPORTAR',dados:{numero_os:'OS 01/0000001-26',valor_total:'100,50',especialidade:'REMOÇÃO',data_atendimento:'2026-08-01 10:30:00'}},
        {hashRegistro:'c2',acao:'IMPORTAR',dados:{numero_os:'OS 01/0000002-26',valor_total:'200.25',especialidade:'PANE',data_atendimento:'2026-08-01 11:00:00'}},
      ]})),
    http.post('/api/porto/importacoes/44/confirmar',async({request})=>{confirmacao=await request.json() as Record<string,unknown>;return HttpResponse.json({importacaoId:44,tipo:'SERVICOS_GERAIS',importados:2,ignorados:0,novos:2,atualizados:0,receitasCriadas:2,receitasAtualizadas:0,valorTotalRecebido:300.75,quinzena:'01/08/2026 a 15/08/2026',dataPagamento:'2026-08-14',erros:[]})}),
  )
  const user=userEvent.setup();render(<PortoImportacoesPage/>)
  await user.click(screen.getByRole('button',{name:/colar serviços da porto/i}))
  const area=screen.getByLabelText(/conteúdo copiado da porto/i)
  await user.type(area,'Número da Ordem de Serviço\tValor Total\nOS 01/0000001-26\t100,50')
  await user.click(screen.getByRole('button',{name:/analisar conteúdo/i}))
  expect(await screen.findByText('OS 01/0000001-26')).toBeInTheDocument()
  expect(screen.getByText((_,element)=>element?.tagName==='SPAN'&&element.textContent==='2 linhas analisadas')).toBeInTheDocument()
  expect(screen.getByText((_,element)=>element?.tagName==='SPAN'&&element.textContent==='2 registros novos')).toBeInTheDocument()
  expect(screen.getAllByText(/R\$\s*300,75/)).toHaveLength(2)
  expect(conteudoRecebido).toContain('OS 01/0000001-26')
  expect(screen.getByRole('button',{name:/confirmar importação/i})).toBeDisabled()
  await user.selectOptions(screen.getByLabelText(/ordem de pagamento/i),'45')
  await user.selectOptions(screen.getByLabelText(/período financeiro/i),'1')
  await user.click(screen.getByRole('button',{name:/confirmar importação/i}))
  expect(await screen.findByText(/2 registros importados/i)).toBeInTheDocument()
  expect(screen.getByText(/2 receitas criadas/i)).toBeInTheDocument()
  expect(screen.getByText(/R\$\s*300,75 recebidos/i)).toBeInTheDocument()
  expect(confirmacao).toMatchObject({ordemPagamentoId:45,calendarioPagamentoId:1})
})
