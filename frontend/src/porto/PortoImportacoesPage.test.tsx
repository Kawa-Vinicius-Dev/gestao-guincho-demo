import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import PortoImportacoesPage from '../pages/PortoImportacoesPage'
import { servidor } from '../test/servidor'

test('envia CSV, exige OP para relatório de OS e confirma a prévia', async () => {
  let numeroAvaliado='',numeroConfirmado=''
  servidor.use(
    http.post('/api/porto/importacoes/previa', () => HttpResponse.json({
      id: 12, nomeArquivo: 'os.csv', tipo: 'OS_VINCULADAS', status: 'AGUARDANDO_CONFERENCIA', totalLinhas: 1,
      requerOrdemPagamento: true, erros: [], linhas: [{ hashRegistro: 'hash', dados: { numero_os: 'OS-901', valor_total: '700.00', especialidade: 'REMOÇÃO' } }],
    }, { status: 201 })),
    http.post('/api/porto/importacoes/12/avaliar', async({request}) => {numeroAvaliado=String((await request.json() as {numeroOrdemPagamento:string}).numeroOrdemPagamento);return HttpResponse.json({
      id: 12, nomeArquivo: 'os.csv', tipo: 'OS_VINCULADAS', status: 'AGUARDANDO_CONFERENCIA', totalLinhas: 1,
      requerOrdemPagamento: true, erros: [], linhas: [{ hashRegistro: 'hash', acao: 'IMPORTAR', dados: { numero_os: 'OS-901', valor_total: '700.00', especialidade: 'REMOÇÃO' } }],
      analiseOrdemPagamento:{numero:'06422281',existente:false,somaArquivo:700,quantidadeReassociacoes:0,valorReassociacoes:0,reassociacoes:[]},
    })}),
    http.post('/api/porto/importacoes/12/confirmar', async ({ request }) => {
      numeroConfirmado = String((await request.json() as { numeroOrdemPagamento: string }).numeroOrdemPagamento)
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
  expect(screen.queryByText(/selecione a op/i)).not.toBeInTheDocument()
  const numero=screen.getByLabelText(/número da op/i)
  expect(screen.getByRole('button',{name:/confirmar importação/i})).toBeDisabled()
  await user.type(numero,'06422281')
  await user.tab()
  await user.selectOptions(screen.getByLabelText(/período financeiro/i),'1')
  expect(await screen.findByText(/será criada automaticamente/i)).toBeInTheDocument()
  const acoes=screen.getByRole('contentinfo',{name:/ações da prévia/i}),tabela=screen.getByRole('table')
  expect(acoes.compareDocumentPosition(tabela)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  await user.click(screen.getByRole('button',{name:/confirmar importação/i}))
  expect(await screen.findByText(/1 registro importado/i)).toBeInTheDocument()
  expect(screen.getByText(/1 receita criada/i)).toBeInTheDocument()
  expect(screen.getByText(/R\$\s*700,00 recebidos/i)).toBeInTheDocument()
  expect(screen.getByText(/01\/07\/2026 a 15\/07\/2026/i)).toBeInTheDocument()
  expect(screen.getByText(/14\/08\/2026/i)).toBeInTheDocument()
  expect(numeroAvaliado).toBe('06422281')
  expect(numeroConfirmado).toBe('06422281')
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
  let avaliacao=0;let confirmouReassociacao=false
  servidor.use(
    http.post('/api/porto/importacoes/previa',()=>HttpResponse.json({id:31,nomeArquivo:'os.csv',tipo:'OS_VINCULADAS',status:'AGUARDANDO_CONFERENCIA',totalLinhas:1,requerOrdemPagamento:true,erros:['Linha 2: valor total vazio'],linhas:[{hashRegistro:'h31',acao:'ERRO',mensagem:'Linha 2: valor total vazio',dados:{numero_os:'OS-31',valor_total:''}}]},{status:201})),
    http.post('/api/porto/importacoes/31/avaliar',()=>{avaliacao++;return HttpResponse.json({id:31,nomeArquivo:'os.csv',tipo:'OS_VINCULADAS',status:'AGUARDANDO_CONFERENCIA',totalLinhas:1,requerOrdemPagamento:true,erros:[],linhas:[{hashRegistro:'h31',acao:'DIVERGENCIA',mensagem:'A OS já está vinculada a outra OP.',dados:{numero_os:'OS-31',valor_total:'300'}}],analiseOrdemPagamento:{numero:'OP-31',existente:true,valorAtual:300,somaArquivo:300,diferenca:0,quantidadeReassociacoes:1,valorReassociacoes:300,reassociacoes:[{numeroOs:'OS-31',opAtual:'OP-ANTIGA',novaOp:'OP-31',valor:300}]}})}),
    http.post('/api/porto/importacoes/31/confirmar',async({request})=>{confirmouReassociacao=Boolean((await request.json() as {confirmarReassociacoes:boolean}).confirmarReassociacoes);return HttpResponse.json({importacaoId:31,tipo:'OS_VINCULADAS',importados:1,ignorados:0})}),
  )
  const user=userEvent.setup();render(<PortoImportacoesPage/>)
  const input=screen.getByLabelText(/arquivo csv/i)
  await user.upload(input,new File(['csv com erro'],'os.csv',{type:'text/csv'}));await user.click(screen.getByRole('button',{name:/analisar csv/i}))
  expect(await screen.findByText(/corrija e reenvie/i)).toBeInTheDocument()
  expect(screen.getByRole('button',{name:/confirmar importação/i})).toBeDisabled()

  await user.upload(input,new File(['csv corrigido'],'os.csv',{type:'text/csv'}));await user.click(screen.getByRole('button',{name:/analisar csv/i}))
  await user.type(await screen.findByLabelText(/número da op/i),'OP-31')
  await user.tab()
  await user.selectOptions(screen.getByLabelText(/período financeiro/i),'1')
  expect(await screen.findByText(/já está vinculada a outra OP/i)).toBeInTheDocument()
  expect(screen.getAllByText('OS-31')).toHaveLength(2)
  expect(screen.getByText('OP-ANTIGA')).toBeInTheDocument()
  expect(screen.getByText(/1 OS será movida/i)).toBeInTheDocument()
  expect(screen.getAllByText(/R\$\s*300,00/i)).toHaveLength(2)
  expect(avaliacao).toBe(1)
  expect(screen.getByRole('button',{name:/confirmar importação/i})).toBeDisabled()
  await user.click(screen.getByLabelText(/confirmo a reassociação/i))
  await user.click(screen.getByRole('button',{name:/confirmar importação/i}))
  expect(await screen.findByText(/1 registro importado/i)).toBeInTheDocument()
  expect(confirmouReassociacao).toBe(true)
})

test('mostra divergência financeira e exige autorização e justificativa',async()=>{
  let confirmacao:Record<string,unknown>|null=null
  servidor.use(
    http.post('/api/porto/importacoes/previa',()=>HttpResponse.json({id:55,nomeArquivo:'valor.csv',tipo:'SERVICOS_GERAIS',status:'AGUARDANDO_CONFERENCIA',totalLinhas:1,requerOrdemPagamento:true,erros:[],linhas:[{hashRegistro:'v1',acao:'IMPORTAR',dados:{numero_os:'OS-55',valor_total:'700'}}]},{status:201})),
    http.post('/api/porto/importacoes/55/avaliar',()=>HttpResponse.json({id:55,nomeArquivo:'valor.csv',tipo:'SERVICOS_GERAIS',status:'AGUARDANDO_CONFERENCIA',totalLinhas:1,requerOrdemPagamento:true,erros:[],linhas:[{hashRegistro:'v1',acao:'IMPORTAR',dados:{numero_os:'OS-55',valor_total:'700'}}],analiseOrdemPagamento:{numero:'06422281',existente:true,valorAtual:650,somaArquivo:700,diferenca:-50,quantidadeReassociacoes:0,valorReassociacoes:0,reassociacoes:[]}})),
    http.post('/api/porto/importacoes/55/confirmar',async({request})=>{confirmacao=await request.json() as Record<string,unknown>;return HttpResponse.json({importacaoId:55,tipo:'SERVICOS_GERAIS',importados:1,ignorados:0,receitasCriadas:1,receitasAtualizadas:0,valorTotalRecebido:700,erros:[]})}),
  )
  const user=userEvent.setup();render(<PortoImportacoesPage/>);await user.upload(screen.getByLabelText(/arquivo csv/i),new File(['csv'],'valor.csv',{type:'text/csv'}));await user.click(screen.getByRole('button',{name:/analisar csv/i}))
  await user.type(await screen.findByLabelText(/número da op/i),'06422281');await user.tab();await user.selectOptions(screen.getByLabelText(/período financeiro/i),'1')
  expect(await screen.findByText(/valor atual da OP/i)).toBeInTheDocument()
  expect(screen.getByText(/R\$\s*650,00/i)).toBeInTheDocument()
  expect(screen.getByText(/R\$\s*700,00/i)).toBeInTheDocument()
  expect(screen.getByText(/-R\$\s*50,00/i)).toBeInTheDocument()
  const botao=screen.getByRole('button',{name:/confirmar importação/i});expect(botao).toBeDisabled()
  await user.click(screen.getByLabelText(/confirmo a atualização do valor/i));await user.selectOptions(screen.getByLabelText(/motivo da divergência/i),'DIVERGENCIA_VALOR');await user.type(screen.getByLabelText(/justificativa da divergência/i),'Valor conferido no arquivo pago.');await user.click(botao)
  expect(await screen.findByText(/1 registro importado/i)).toBeInTheDocument()
  expect(confirmacao).toMatchObject({numeroOrdemPagamento:'06422281',confirmarDivergencias:true,motivoDivergencia:'DIVERGENCIA_VALOR',justificativaDivergencia:'Valor conferido no arquivo pago.'})
})

test('cola serviços, mostra resumo da prévia e confirma somente depois da análise',async()=>{
  let conteudoRecebido='',confirmacao:Record<string,unknown>|null=null
  servidor.use(
    http.post('/api/porto/importacoes/previa-conteudo',async({request})=>{
      conteudoRecebido=String((await request.json() as {conteudo:string}).conteudo)
      return HttpResponse.json({id:44,nomeArquivo:'colagem-servicos-porto.txt',tipo:'SERVICOS_GERAIS',status:'AGUARDANDO_CONFERENCIA',totalLinhas:2,requerOrdemPagamento:true,erros:[],
        resumo:{linhasAnalisadas:2,opsUnicas:0,registrosNovos:2,registrosExistentes:0,registrosAtualizados:0,duplicidades:0,erros:0,valorTotal:300.75},
        linhas:[
          {hashRegistro:'c1',acao:'IMPORTAR',dados:{numero_os:'OS 01/0000001-26',valor_total:'100,50',especialidade:'REMOÇÃO',data_atendimento:'2026-08-01 10:30:00'}},
          {hashRegistro:'c2',acao:'IMPORTAR',dados:{numero_os:'OS 01/0000002-26',valor_total:'200.25',especialidade:'PANE',data_atendimento:'2026-08-01 11:00:00'}},
        ]},{status:201})
    }),
    http.post('/api/porto/importacoes/44/avaliar',()=>HttpResponse.json({id:44,nomeArquivo:'colagem-servicos-porto.txt',tipo:'SERVICOS_GERAIS',status:'AGUARDANDO_CONFERENCIA',totalLinhas:2,requerOrdemPagamento:true,erros:[],analiseOrdemPagamento:{numero:'OP-GERAL-PAGA',existente:false,somaArquivo:300.75,quantidadeReassociacoes:0,valorReassociacoes:0,reassociacoes:[]},
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
  await user.type(screen.getByLabelText(/número da op/i),'OP-GERAL-PAGA')
  await user.tab()
  await user.selectOptions(screen.getByLabelText(/período financeiro/i),'1')
  const botaoConfirmar=screen.getByRole('button',{name:/confirmar importação/i})
  await waitFor(()=>expect(botaoConfirmar).toBeEnabled())
  await user.click(botaoConfirmar)
  expect(await screen.findByText(/2 registros importados/i)).toBeInTheDocument()
  expect(screen.getByText(/2 receitas criadas/i)).toBeInTheDocument()
  expect(screen.getByText(/R\$\s*300,75 recebidos/i)).toBeInTheDocument()
  expect(confirmacao).toMatchObject({numeroOrdemPagamento:'OP-GERAL-PAGA',calendarioPagamentoId:1})
})

test('habilita e confirma automaticamente OP 06422281 com período e 244 OS existentes',async()=>{
  const linhas=Array.from({length:244},(_,indice)=>({
    hashRegistro:`existente-${indice+1}`,
    acao:'IGNORAR' as const,
    mensagem:'A OS já está atualizada.',
    dados:{numero_os:`OS-${String(indice+1).padStart(3,'0')}`,valor_total:'100.00',especialidade:'REMOÇÃO',data_atendimento:'2026-07-10'},
  }))
  let avaliacao:Record<string,unknown>|null=null,confirmacao:Record<string,unknown>|null=null
  servidor.use(
    http.post('/api/porto/importacoes/previa',()=>HttpResponse.json({
      id:64,nomeArquivo:'op-06422281.csv',tipo:'SERVICOS_GERAIS',status:'AGUARDANDO_CONFERENCIA',totalLinhas:244,requerOrdemPagamento:true,erros:[],linhas,
      resumo:{linhasAnalisadas:244,opsUnicas:0,registrosNovos:0,registrosExistentes:244,registrosAtualizados:0,duplicidades:0,erros:0,valorTotal:24400},
    },{status:201})),
    http.post('/api/porto/importacoes/64/avaliar',async({request})=>{
      avaliacao=await request.json() as Record<string,unknown>
      return HttpResponse.json({
        id:64,nomeArquivo:'op-06422281.csv',tipo:'SERVICOS_GERAIS',status:'AGUARDANDO_CONFERENCIA',totalLinhas:244,requerOrdemPagamento:true,erros:[],
        linhas:linhas.map(linha=>({...linha,acao:'ATUALIZAR',mensagem:undefined})),
        resumo:{linhasAnalisadas:244,opsUnicas:0,registrosNovos:0,registrosExistentes:244,registrosAtualizados:244,duplicidades:0,erros:0,valorTotal:24400},
        analiseOrdemPagamento:{numero:'06422281',existente:true,valorAtual:24400,somaArquivo:24400,diferenca:0,quantidadeReassociacoes:0,valorReassociacoes:0,reassociacoes:[]},
      })
    }),
    http.post('/api/porto/importacoes/64/confirmar',async({request})=>{
      confirmacao=await request.json() as Record<string,unknown>
      return HttpResponse.json({importacaoId:64,tipo:'SERVICOS_GERAIS',importados:244,ignorados:0,novos:0,atualizados:244,receitasCriadas:0,receitasAtualizadas:244,valorTotalRecebido:24400,quinzena:'01/07/2026 a 15/07/2026',dataPagamento:'2026-08-14',erros:[]})
    }),
  )
  const user=userEvent.setup();render(<PortoImportacoesPage/>);await user.upload(screen.getByLabelText(/arquivo csv/i),new File(['244 OS'],'op-06422281.csv',{type:'text/csv'}));await user.click(screen.getByRole('button',{name:/analisar csv/i}))
  expect(await screen.findByText((_,element)=>element?.tagName==='SPAN'&&element.textContent==='244 já existentes')).toBeInTheDocument()
  await user.selectOptions(screen.getByLabelText(/período financeiro/i),'1')
  await user.type(screen.getByLabelText(/número da op/i),'06422281')
  const botao=screen.getByRole('button',{name:/confirmar importação/i})
  await waitFor(()=>expect(botao).toBeEnabled())
  expect(avaliacao).toEqual({numeroOrdemPagamento:'06422281',calendarioPagamentoId:1})
  expect(avaliacao).not.toHaveProperty('ordemPagamentoId')
  await user.click(botao)
  expect(await screen.findByText(/244 registros importados/i)).toBeInTheDocument()
  expect(confirmacao).toMatchObject({numeroOrdemPagamento:'06422281',calendarioPagamentoId:1})
  expect(confirmacao).not.toHaveProperty('ordemPagamentoId')
})

test('mostra na tela erro retornado pela validação automática da OP',async()=>{
  servidor.use(
    http.post('/api/porto/importacoes/previa',()=>HttpResponse.json({id:65,nomeArquivo:'erro-op.csv',tipo:'SERVICOS_GERAIS',status:'AGUARDANDO_CONFERENCIA',totalLinhas:1,requerOrdemPagamento:true,erros:[],linhas:[{hashRegistro:'erro-1',acao:'IGNORAR',dados:{numero_os:'OS-ERRO',valor_total:'100.00'}}]},{status:201})),
    http.post('/api/porto/importacoes/65/avaliar',()=>HttpResponse.json({detalhe:'Não foi possível validar a OP informada.'},{status:400})),
  )
  const user=userEvent.setup();render(<PortoImportacoesPage/>);await user.upload(screen.getByLabelText(/arquivo csv/i),new File(['OS'],'erro-op.csv',{type:'text/csv'}));await user.click(screen.getByRole('button',{name:/analisar csv/i}))
  await user.selectOptions(await screen.findByLabelText(/período financeiro/i),'1');await user.type(screen.getByLabelText(/número da op/i),'06422281')
  expect(await screen.findByText('Não foi possível validar a OP informada.')).toBeInTheDocument()
  expect(screen.getByRole('button',{name:/confirmar importação/i})).toBeDisabled()
})
