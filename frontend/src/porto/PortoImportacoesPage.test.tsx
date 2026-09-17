import { act, within, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, test, vi } from 'vitest'
import PortoImportacoesPage from './PortoImportacoesPage'
import { MemoryRouter } from 'react-router-dom'
import { servidor } from '../test/servidor'
import { confirmarNaJanela } from '../test/confirmar'

test('mede a chamada de análise de importação', async () => {
  const medida = vi.spyOn(performance, 'measure')
  try {
    servidor.use(
      http.post('/api/porto/importacoes/previa', () => HttpResponse.json({
        id: 81, nomeArquivo: 'medicao.csv', tipo: 'SERVICOS_GERAIS', status: 'AGUARDANDO_CONFERENCIA', totalLinhas: 1,
        requerOrdemPagamento: false, erros: [], linhas: [{ hashRegistro: 'medicao', dados: { numero_os: 'OS-MEDICAO' } }],
      }, { status: 201 })),
    )
    const user = userEvent.setup()
    render(<PortoImportacoesPage />)
    await user.upload(screen.getByLabelText(/arquivo csv/i), new File(['csv'], 'medicao.csv', { type: 'text/csv' }))
    await user.click(screen.getByRole('button', { name: /analisar csv/i }))

    expect(await screen.findByText('OS-MEDICAO')).toBeInTheDocument()
    expect(medida).toHaveBeenCalledWith(
      'api:POST /api/porto/importacoes/previa',
      expect.stringMatching(/^api:POST \/api\/porto\/importacoes\/previa:start:/),
      expect.stringMatching(/^api:POST \/api\/porto\/importacoes\/previa:end:/),
    )
  } finally {
    medida.mockRestore()
  }
})

test('ignora duplo clique enquanto confirma a importação', async () => {
  let confirmacoes=0
  servidor.use(
    http.post('/api/porto/importacoes/previa', () => HttpResponse.json({
      id: 82, nomeArquivo: 'duplo-clique.csv', tipo: 'PREVISAO_RECEBER', status: 'AGUARDANDO_CONFERENCIA', totalLinhas: 1,
      requerOrdemPagamento: false, erros: [], linhas: [{ hashRegistro: 'duplo-clique', dados: { numero_op: 'OP-DUPLO-1', valor_total: '100.00' } }],
    }, { status: 201 })),
    http.post('/api/porto/importacoes/82/confirmar', async () => {
      confirmacoes++
      await new Promise(resolve => setTimeout(resolve, 20))
      return HttpResponse.json({ importacaoId: 82, tipo: 'PREVISAO_RECEBER', importados: 1, ignorados: 0 })
    }),
  )
  const user=userEvent.setup()
  render(<PortoImportacoesPage />)
  await user.upload(screen.getByLabelText(/arquivo csv/i),new File(['csv'],'duplo-clique.csv',{type:'text/csv'}))
  await user.click(screen.getByRole('button',{name:/analisar csv/i}))
  await screen.findByText('OP-DUPLO-1')
  const confirmar=screen.getByRole('button',{name:/confirmar importação/i})
  confirmar.click()
  const janela=await screen.findByRole('dialog')
  const sim=within(janela).getByRole('button',{name:/sim, importar/i})
  await act(async()=>{
    sim.click()
    sim.click()
  })
  await screen.findByText(/1 registro importado/i)
  expect(confirmacoes).toBe(1)
})

test('expõe o progresso e mantém erro de confirmação acionável', async () => {
  let concluirAnalise!: (resposta: Response) => void
  let concluirConfirmacao!: (resposta: Response) => void
  servidor.use(
    http.post('/api/porto/importacoes/previa', () => new Promise(resolve => { concluirAnalise=resolve })),
    http.post('/api/porto/importacoes/83/confirmar', () => new Promise(resolve => { concluirConfirmacao=resolve })),
  )
  const user=userEvent.setup()
  render(<PortoImportacoesPage />)
  await user.upload(screen.getByLabelText(/arquivo csv/i),new File(['csv'],'progresso.csv',{type:'text/csv'}))
  await user.click(screen.getByRole('button',{name:/analisar csv/i}))
  expect(screen.getByRole('status')).toHaveTextContent(/analisando arquivo/i)
  concluirAnalise(HttpResponse.json({id:83,nomeArquivo:'progresso.csv',tipo:'PREVISAO_RECEBER',status:'AGUARDANDO_CONFERENCIA',totalLinhas:1,requerOrdemPagamento:false,erros:[],linhas:[{hashRegistro:'progresso',dados:{numero_op:'OP-PROGRESSO'}}]},{status:201}))
  await screen.findByText('OP-PROGRESSO')
  await user.click(screen.getByRole('button',{name:/confirmar importação/i}));await confirmarNaJanela()
  expect(screen.getByRole('status')).toHaveTextContent(/confirmando importação/i)
  concluirConfirmacao(HttpResponse.json({detalhe:'Falha temporária.'},{status:500}))
  expect(await screen.findByRole('alert')).toHaveTextContent('Falha temporária.')
  expect(screen.getByRole('button',{name:/tentar novamente/i})).toBeInTheDocument()
})

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
    expect(await screen.findByText(/será criada automaticamente/i)).toBeInTheDocument()
  const acoes=screen.getByRole('contentinfo',{name:/ações da prévia/i}),tabela=screen.getByRole('table')
  expect(acoes.compareDocumentPosition(tabela)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  await user.click(screen.getByRole('button',{name:/confirmar importação/i}));await confirmarNaJanela()
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
  await user.click(screen.getByRole('button',{name:/cancelar prévia/i}));await confirmarNaJanela()
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
    expect(await screen.findByText(/já está vinculada a outra OP/i)).toBeInTheDocument()
  expect(screen.getAllByText('OS-31')).toHaveLength(2)
  expect(screen.getByText('OP-ANTIGA')).toBeInTheDocument()
  expect(screen.getByText(/1 OS será movida/i)).toBeInTheDocument()
  expect(screen.getAllByText(/R\$\s*300,00/i)).toHaveLength(2)
  expect(avaliacao).toBe(1)
  expect(screen.getByRole('button',{name:/confirmar importação/i})).toBeDisabled()
  await user.click(screen.getByLabelText(/confirmo a reassociação/i))
  await user.click(screen.getByRole('button',{name:/confirmar importação/i}));await confirmarNaJanela()
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
  await user.type(await screen.findByLabelText(/número da op/i),'06422281');await user.tab();  expect(await screen.findByText(/valor atual da OP/i)).toBeInTheDocument()
  expect(screen.getByText(/R\$\s*650,00/i)).toBeInTheDocument()
  expect(screen.getByText(/R\$\s*700,00/i)).toBeInTheDocument()
  expect(screen.getByText(/-R\$\s*50,00/i)).toBeInTheDocument()
  const botao=screen.getByRole('button',{name:/confirmar importação/i});expect(botao).toBeDisabled()
  await user.click(screen.getByLabelText(/confirmo a atualização do valor/i));await user.selectOptions(screen.getByLabelText(/motivo da divergência/i),'DIVERGENCIA_VALOR');await user.type(screen.getByLabelText(/justificativa da divergência/i),'Valor conferido no arquivo pago.');await user.click(botao);await confirmarNaJanela()
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
  // Enquanto a prévia espera confirmação, o texto colado continua lá.
  expect(screen.getByLabelText(/conteúdo copiado da porto/i)).not.toHaveValue('')
  expect(screen.getByRole('button',{name:/confirmar importação/i})).toBeDisabled()
  await user.type(screen.getByLabelText(/número da op/i),'OP-GERAL-PAGA')
  await user.tab()
    const botaoConfirmar=screen.getByRole('button',{name:/confirmar importação/i})
  await waitFor(()=>expect(botaoConfirmar).toBeEnabled())
  await user.click(botaoConfirmar);await confirmarNaJanela()
  expect(await screen.findByText(/2 registros importados/i)).toBeInTheDocument()
  expect(screen.getByText(/2 receitas criadas/i)).toBeInTheDocument()
  expect(screen.getByText(/R\$\s*300,75 recebidos/i)).toBeInTheDocument()
  expect(confirmacao).toMatchObject({numeroOrdemPagamento:'OP-GERAL-PAGA'})
  // Gravou: o texto colado sai e a tela fica pronta para a proxima importacao.
  expect(screen.getByLabelText(/conteúdo copiado da porto/i)).toHaveValue('')
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
    await user.type(screen.getByLabelText(/número da op/i),'06422281')
  const botao=screen.getByRole('button',{name:/confirmar importação/i})
  await waitFor(()=>expect(botao).toBeEnabled())
  expect(avaliacao).toEqual({numeroOrdemPagamento:'06422281'})
  expect(avaliacao).not.toHaveProperty('ordemPagamentoId')
  await user.click(botao);await confirmarNaJanela()
  expect(await screen.findByText(/244 registros importados/i)).toBeInTheDocument()
  expect(confirmacao).toMatchObject({numeroOrdemPagamento:'06422281'})
  expect(confirmacao).not.toHaveProperty('ordemPagamentoId')
})

test('mostra na tela erro retornado pela validação automática da OP',async()=>{
  servidor.use(
    http.post('/api/porto/importacoes/previa',()=>HttpResponse.json({id:65,nomeArquivo:'erro-op.csv',tipo:'SERVICOS_GERAIS',status:'AGUARDANDO_CONFERENCIA',totalLinhas:1,requerOrdemPagamento:true,erros:[],linhas:[{hashRegistro:'erro-1',acao:'IGNORAR',dados:{numero_os:'OS-ERRO',valor_total:'100.00'}}]},{status:201})),
    http.post('/api/porto/importacoes/65/avaliar',()=>HttpResponse.json({detalhe:'Não foi possível validar a OP informada.'},{status:400})),
  )
  const user=userEvent.setup();render(<PortoImportacoesPage/>);await user.upload(screen.getByLabelText(/arquivo csv/i),new File(['OS'],'erro-op.csv',{type:'text/csv'}));await user.click(screen.getByRole('button',{name:/analisar csv/i}))
  await user.type(screen.getByLabelText(/número da op/i),'06422281')
  expect(await screen.findByText('Não foi possível validar a OP informada.')).toBeInTheDocument()
  expect(screen.getByRole('button',{name:/confirmar importação/i})).toBeDisabled()
})

test('falha ao cancelar a prévia não oferece um botão que importa', async () => {
  let confirmacoes = 0
  servidor.use(
    http.post('/api/porto/importacoes/previa', () => HttpResponse.json({
      id: 84, nomeArquivo: 'cancelamento.csv', tipo: 'PREVISAO_RECEBER', status: 'AGUARDANDO_CONFERENCIA', totalLinhas: 1,
      requerOrdemPagamento: false, erros: [], linhas: [{ hashRegistro: 'cancelamento', dados: { numero_op: 'OP-CANCELA-1', valor_total: '100.00' } }],
    }, { status: 201 })),
    http.post('/api/porto/importacoes/84/cancelar', () => HttpResponse.json({ detalhe: 'Não foi possível cancelar agora.' }, { status: 400 })),
    http.post('/api/porto/importacoes/84/confirmar', () => { confirmacoes++; return HttpResponse.json({ importacaoId: 84, tipo: 'PREVISAO_RECEBER', importados: 1, ignorados: 0 }) }),
  )
  const user = userEvent.setup()
  render(<PortoImportacoesPage />)
  await user.upload(screen.getByLabelText(/arquivo csv/i), new File(['csv'], 'cancelamento.csv', { type: 'text/csv' }))
  await user.click(screen.getByRole('button', { name: /analisar csv/i }))
  await screen.findByText('OP-CANCELA-1')

  await user.click(screen.getByRole('button', { name: /cancelar prévia/i }));await confirmarNaJanela()

  expect(await screen.findByText('Não foi possível cancelar agora.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /tentar novamente/i })).not.toBeInTheDocument()
  expect(confirmacoes).toBe(0)
})

test('falha ao confirmar oferece repetir a própria confirmação', async () => {
  let tentativas = 0
  servidor.use(
    http.post('/api/porto/importacoes/previa', () => HttpResponse.json({
      id: 85, nomeArquivo: 'repeticao.csv', tipo: 'PREVISAO_RECEBER', status: 'AGUARDANDO_CONFERENCIA', totalLinhas: 1,
      requerOrdemPagamento: false, erros: [], linhas: [{ hashRegistro: 'repeticao', dados: { numero_op: 'OP-REPETE-1', valor_total: '100.00' } }],
    }, { status: 201 })),
    http.post('/api/porto/importacoes/85/confirmar', () => {
      tentativas++
      return tentativas === 1
        ? HttpResponse.json({ detalhe: 'Instabilidade momentânea.' }, { status: 500 })
        : HttpResponse.json({ importacaoId: 85, tipo: 'PREVISAO_RECEBER', importados: 1, ignorados: 0 })
    }),
  )
  const user = userEvent.setup()
  render(<PortoImportacoesPage />)
  await user.upload(screen.getByLabelText(/arquivo csv/i), new File(['csv'], 'repeticao.csv', { type: 'text/csv' }))
  await user.click(screen.getByRole('button', { name: /analisar csv/i }))
  await screen.findByText('OP-REPETE-1')

  await user.click(screen.getByRole('button', { name: /confirmar importação/i }));await confirmarNaJanela()
  await user.click(await screen.findByRole('button', { name: /tentar novamente/i }))

  expect(await screen.findByText(/1 registro importado/i)).toBeInTheDocument()
  expect(tentativas).toBe(2)
})

// O aviso de OS sem socorrista sobrevivia a acao seguinte: dava para ver
// "Previa cancelada" em verde e, logo abaixo, o alerta vermelho da importacao
// anterior. Parecia que o cancelamento tinha dado errado.
test('o aviso da importacao anterior some ao cancelar a prévia seguinte',async()=>{
  servidor.use(
    http.get('/api/porto/ordens-pagamento',()=>HttpResponse.json([])),
    http.post('/api/porto/importacoes/previa',()=>HttpResponse.json({id:31,nomeArquivo:'a.csv',tipo:'PREVISAO_RECEBER',status:'AGUARDANDO_CONFERENCIA',totalLinhas:1,requerOrdemPagamento:false,erros:[],linhas:[{hashRegistro:'h31',acao:'IMPORTAR',dados:{numero_op:'OP-31'}}]},{status:201})),
    http.post('/api/porto/importacoes/31/confirmar',()=>HttpResponse.json({importacaoId:31,tipo:'PREVISAO_RECEBER',importados:1,ignorados:0,receitasCriadas:0,receitasAtualizadas:0,valorTotalRecebido:0,erros:[],osSemSocorrista:['5655840/26','5665701/26']})),
    http.post('/api/porto/importacoes/31/cancelar',()=>HttpResponse.json({id:31,status:'CANCELADA'})),
  )
  const user=userEvent.setup();render(<PortoImportacoesPage/>)

  await user.upload(screen.getByLabelText(/arquivo csv/i),new File(['csv'],'a.csv',{type:'text/csv'}))
  await user.click(screen.getByRole('button',{name:/analisar csv/i}))
  await user.click(await screen.findByRole('button',{name:/confirmar importação/i}));await confirmarNaJanela()
  expect(await screen.findByText('5655840/26')).toBeInTheDocument()

  // Segunda prévia, cancelada: o alerta da primeira nao pode continuar na tela.
  await user.upload(screen.getByLabelText(/arquivo csv/i),new File(['csv'],'a.csv',{type:'text/csv'}))
  await user.click(screen.getByRole('button',{name:/analisar csv/i}))
  expect(screen.queryByText('5655840/26')).not.toBeInTheDocument()

  await user.click(await screen.findByRole('button',{name:/cancelar prévia/i}));await confirmarNaJanela()
  expect(await screen.findByText(/prévia cancelada/i)).toBeInTheDocument()
  expect(screen.queryByText('5655840/26')).not.toBeInTheDocument()
})

// Se gravar falhar, nada do que foi colado se perde: da para tentar de novo.
test('importação colada que falha ao confirmar mantém o texto', async () => {
  servidor.use(
    http.post('/api/porto/importacoes/previa-conteudo', () => HttpResponse.json({
      id: 86, nomeArquivo: 'colagem.txt', tipo: 'PREVISAO_RECEBER', status: 'AGUARDANDO_CONFERENCIA', totalLinhas: 1,
      requerOrdemPagamento: false, erros: [], linhas: [{ hashRegistro: 'falha-1', acao: 'IMPORTAR', dados: { numero_op: 'OP-FALHA-1', valor_total: '100.00' } }],
    }, { status: 201 })),
    http.post('/api/porto/importacoes/86/confirmar', () => HttpResponse.json({ detalhe: 'Instabilidade momentânea.' }, { status: 500 })),
  )
  const user = userEvent.setup()
  render(<PortoImportacoesPage />)
  await user.click(screen.getByRole('button', { name: /colar serviços da porto/i }))
  await user.type(screen.getByLabelText(/conteúdo copiado da porto/i), 'OP-FALHA-1\t100.00')
  await user.click(screen.getByRole('button', { name: /analisar conteúdo/i }))
  await screen.findByText('OP-FALHA-1')

  await user.click(screen.getByRole('button', { name: /confirmar importação/i })); await confirmarNaJanela()

  expect(await screen.findByText(/instabilidade momentânea/i)).toBeInTheDocument()
  expect(screen.getByLabelText(/conteúdo copiado da porto/i)).toHaveValue('OP-FALHA-1\t100.00')
})
// Escolher o dono de uma OS (uma ou todas) decide de quem e a comissao: pede confirmacao antes.
test('escolher socorrista para as OS sem dono pede confirmação antes de aplicar', async () => {
  servidor.use(
    http.get('/api/motoristas', () => HttpResponse.json([{ id: 7, nome: 'SOCORRISTA SETE', qra: '777', ativo: true }])),
    http.post('/api/porto/importacoes/previa', () => HttpResponse.json({
      id: 87, nomeArquivo: 'orfas.csv', tipo: 'PREVISAO_RECEBER', status: 'AGUARDANDO_CONFERENCIA', totalLinhas: 2,
      requerOrdemPagamento: false, erros: [],
      linhas: [
        { hashRegistro: 'o1', acao: 'IMPORTAR', dados: { numero_op: 'OP-ORFA-1', valor_total: '100.00' } },
        { hashRegistro: 'o2', acao: 'IMPORTAR', dados: { numero_op: 'OP-ORFA-2', valor_total: '100.00' } },
      ],
      orfas: [{ hashRegistro: 'o1', numeroOs: 'OS-ORFA-1' }, { hashRegistro: 'o2', numeroOs: 'OS-ORFA-2' }],
    }, { status: 201 })),
  )
  const user = userEvent.setup()
  render(<PortoImportacoesPage />)
  await user.upload(screen.getByLabelText(/arquivo csv/i), new File(['csv'], 'orfas.csv', { type: 'text/csv' }))
  await user.click(screen.getByRole('button', { name: /analisar csv/i }))
  expect(await screen.findByText(/2 ordens de serviço vieram sem socorrista/i)).toBeInTheDocument()

  await user.selectOptions(screen.getByLabelText(/aplicar o mesmo socorrista a todas/i), '7')
  const janela = await screen.findByRole('dialog', { name: /aplicar socorrista sete a todas/i })
  expect(within(janela).getAllByText('2').length).toBeGreaterThan(0)
  // Voltar nao aplica nada.
  await user.click(within(janela).getByRole('button', { name: /voltar/i }))
  expect(screen.getByText(/2 ordens de serviço vieram sem socorrista/i)).toBeInTheDocument()

  await user.selectOptions(screen.getByLabelText(/socorrista da os OS-ORFA-1/i), '7')
  expect(await screen.findByRole('dialog', { name: /atribuir a os a socorrista sete/i })).toBeInTheDocument()
  await confirmarNaJanela()
  expect(await screen.findByText(/1 ordem de serviço veio sem socorrista/i)).toBeInTheDocument()
})
test('depois de importar a OP, avisa o que não veio e o que veio com valor diferente', async () => {
  servidor.use(
    http.post('/api/porto/importacoes/previa', () => HttpResponse.json({
      id: 91, nomeArquivo: 'op.csv', tipo: 'OS_VINCULADAS', status: 'AGUARDANDO_CONFERENCIA', totalLinhas: 1,
      requerOrdemPagamento: true, erros: [], linhas: [{ hashRegistro: 'h91', acao: 'IMPORTAR', dados: { numero_os: 'OS-91', valor_total: '700.00' } }],
    }, { status: 201 })),
    http.post('/api/porto/importacoes/91/avaliar', () => HttpResponse.json({
      id: 91, nomeArquivo: 'op.csv', tipo: 'OS_VINCULADAS', status: 'AGUARDANDO_CONFERENCIA', totalLinhas: 1,
      requerOrdemPagamento: true, erros: [], linhas: [{ hashRegistro: 'h91', acao: 'IMPORTAR', dados: { numero_os: 'OS-91', valor_total: '700.00' } }],
      analiseOrdemPagamento: { numero: '06438807', existente: false, somaArquivo: 700, quantidadeReassociacoes: 0, valorReassociacoes: 0, reassociacoes: [] },
    })),
    http.post('/api/porto/importacoes/91/confirmar', () => HttpResponse.json({
      importacaoId: 91, tipo: 'OS_VINCULADAS', importados: 1, ignorados: 0, receitasCriadas: 1, receitasAtualizadas: 0,
      valorTotalRecebido: 700, erros: [],
      naoEncontradas: [{ id: 5, numero: '01/2937402-26', dataAtendimento: '2026-09-02', socorrista: 'QEBSON RAMOS', viatura: 'L25', valorManual: 120 }],
      divergentes: [{ id: 6, numero: '02/5384426-26', valorManual: 100, valorOp: 125, diferenca: 25 }],
    })),
  )
  const user = userEvent.setup()
  render(<MemoryRouter><PortoImportacoesPage /></MemoryRouter>)
  await user.upload(screen.getByLabelText(/arquivo csv/i), new File(['csv'], 'op.csv', { type: 'text/csv' }))
  await user.click(screen.getByRole('button', { name: /analisar csv/i }))
  await screen.findByText('OS-91')
  await user.type(screen.getByLabelText(/número da op/i), '06438807')
  await screen.findByText(/será criada automaticamente/i)
  await user.click(screen.getByRole('button', { name: /confirmar importação/i }))
  await confirmarNaJanela()

  expect(await screen.findByText(/1 serviço do diário não veio nesta op/i)).toBeInTheDocument()
  // A OS que faltou abre na tela de Ordens de servico, ja filtrada nela.
  expect(screen.getByRole('link', { name: '01/2937402-26' }))
    .toHaveAttribute('href', '/porto/ordens-servico?os=01%2F2937402-26')
  expect(screen.getByText(/1 serviço veio com valor diferente do informado/i)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '02/5384426-26' })).toBeInTheDocument()
})

test('diferença a mais no valor da OP é apontada como provável crédito', async () => {
  servidor.use(
    http.post('/api/porto/importacoes/previa', () => HttpResponse.json({
      id: 92, nomeArquivo: 'op.csv', tipo: 'OS_VINCULADAS', status: 'AGUARDANDO_CONFERENCIA', totalLinhas: 1,
      requerOrdemPagamento: true, erros: [], linhas: [{ hashRegistro: 'h92', acao: 'IMPORTAR', dados: { numero_os: 'OS-92', valor_total: '54800.20' } }],
    }, { status: 201 })),
    http.post('/api/porto/importacoes/92/avaliar', () => HttpResponse.json({
      id: 92, nomeArquivo: 'op.csv', tipo: 'OS_VINCULADAS', status: 'AGUARDANDO_CONFERENCIA', totalLinhas: 1,
      requerOrdemPagamento: true, erros: [], linhas: [{ hashRegistro: 'h92', acao: 'IMPORTAR', dados: { numero_os: 'OS-92', valor_total: '54800.20' } }],
      analiseOrdemPagamento: { numero: '06416626', existente: true, valorAtual: 55268.53, somaArquivo: 54800.20,
        diferenca: -468.33, quantidadeReassociacoes: 0, valorReassociacoes: 0, reassociacoes: [] },
    })),
  )
  const user = userEvent.setup()
  render(<MemoryRouter><PortoImportacoesPage /></MemoryRouter>)
  await user.upload(screen.getByLabelText(/arquivo csv/i), new File(['csv'], 'op.csv', { type: 'text/csv' }))
  await user.click(screen.getByRole('button', { name: /analisar csv/i }))
  await screen.findByText('OS-92')
  await user.type(screen.getByLabelText(/número da op/i), '06416626')

  expect(await screen.findByText(/divergência financeira encontrada/i)).toBeInTheDocument()
  expect(screen.getAllByText(/R\$\s*468,33/).length).toBeGreaterThan(0)
  expect(screen.getByRole('link', { name: /créditos/i })).toHaveAttribute('href', '/creditos')
})
