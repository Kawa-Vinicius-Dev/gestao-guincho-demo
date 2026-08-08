import { render,screen,within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http,HttpResponse } from 'msw'
import { expect,test } from 'vitest'
import { servidor } from '../test/servidor'
import MinhaComissaoPage from '../pages/MinhaComissaoPage'
import ComissoesPage from '../pages/ComissoesPage'

const periodos=[{id:7,dataPagamento:'2026-08-31',competenciaInicio:'2026-08-01',competenciaFim:'2026-08-31',descricao:'Agosto',ativo:true}]
const detalhe={calendarioPagamentoId:7,periodo:'01/08/2026 a 31/08/2026',funcionario:'Ana Motorista',motoristaId:4,quantidadeServicosPagos:2,producaoPaga:1000,percentualComissao:.2,comissaoBruta:200,alimentacaoAprovada:250,alimentacaoPendente:35,liquido:-50,aguardandoOp:false,servicos:[{id:1,numeroOs:'OS-1',especialidade:'GUINCHO',dataAtendimento:'2026-06-30',numeroOp:'OP-7',valorServico:1000,comissaoServico:200}],alimentacoes:[{id:9,motoristaId:4,data:'2026-08-10',valor:250,situacao:'PAGO',aprovada:true}]}

test('funcionário vê composição auditável, saldo negativo e registra alimentação própria',async()=>{
  let corpo:unknown
  servidor.use(http.get('/api/comissoes/periodos',()=>HttpResponse.json(periodos)),http.get('/api/minha-comissao',()=>HttpResponse.json(detalhe)),http.post('/api/minha-comissao/alimentacoes',async({request})=>{corpo=await request.json();return HttpResponse.json({id:10,motoristaId:4,data:'2026-08-20',valor:35,situacao:'PENDENTE',aprovada:false},{status:201})}))
  const user=userEvent.setup();render(<MinhaComissaoPage/>);expect(await screen.findByText('-R$ 50,00')).toBeInTheDocument();expect(screen.getByText('OS-1')).toBeInTheDocument();expect(screen.getByText(/30\/06\/2026/)).toBeInTheDocument()
  await user.type(screen.getByLabelText(/valor da alimentação/i),'35');await user.type(screen.getByLabelText(/data da alimentação/i),'2026-08-20');await user.click(screen.getByRole('button',{name:/registrar alimentação/i}));expect(corpo).toEqual(expect.objectContaining({valor:35,data:'2026-08-20'}));expect(JSON.stringify(corpo)).not.toContain('motoristaId')
})

test('administrador filtra resumo e abre o detalhamento que forma a comissão',async()=>{
  servidor.use(http.get('/api/comissoes/periodos',()=>HttpResponse.json(periodos)),http.get('/api/motoristas',()=>HttpResponse.json([{id:4,nome:'Ana Motorista',qra:'ANA',ativo:true}])),http.get('/api/comissoes/resumo',()=>HttpResponse.json([{motoristaId:4,funcionario:'Ana Motorista',quantidadeServicosPagos:2,producaoPaga:1000,comissaoBruta:200,alimentacaoAprovada:250,liquido:-50}])),http.get('/api/comissoes/4',()=>HttpResponse.json(detalhe)))
  const user=userEvent.setup();render(<ComissoesPage/>);const linha=await screen.findByRole('row',{name:/ana motorista/i});expect(within(linha).getByText('-R$ 50,00')).toBeInTheDocument();await user.click(within(linha).getByRole('button',{name:/detalhar/i}));expect(await screen.findByRole('dialog')).toHaveTextContent('OS-1')
})

test('administrador registra o pagamento do líquido positivo uma única vez',async()=>{
  const positivo={...detalhe,alimentacaoAprovada:30,liquido:170}
  const pagamento={id:12,motoristaId:4,calendarioPagamentoId:7,despesaId:91,valorPago:170,dataPagamento:'2026-08-31',formaPagamento:'PIX',pagoPor:'Administrador',criadoEm:'2026-08-31T12:00:00Z'}
  let chamadas=0
  servidor.use(
    http.get('/api/comissoes/periodos',()=>HttpResponse.json(periodos)),
    http.get('/api/motoristas',()=>HttpResponse.json([{id:4,nome:'Ana Motorista',qra:'ANA',ativo:true}])),
    http.get('/api/comissoes/resumo',()=>HttpResponse.json([{motoristaId:4,funcionario:'Ana Motorista',quantidadeServicosPagos:2,producaoPaga:1000,comissaoBruta:200,alimentacaoAprovada:30,liquido:170,pagamento:chamadas?pagamento:undefined}])),
    http.get('/api/comissoes/4',()=>HttpResponse.json(chamadas?{...positivo,pagamento}:positivo)),
    http.post('/api/comissoes/4/pagamentos',async({request})=>{chamadas++;expect(await request.json()).toEqual(expect.objectContaining({dataPagamento:'2026-08-31',formaPagamento:'PIX'}));return HttpResponse.json(pagamento,{status:201})}),
  )
  const user=userEvent.setup();render(<ComissoesPage/>);const linha=await screen.findByRole('row',{name:/ana motorista/i});await user.click(within(linha).getByRole('button',{name:/detalhar/i}));
  const dialogo=await screen.findByRole('dialog');await user.type(within(dialogo).getByLabelText(/data do pagamento/i),'2026-08-31');await user.click(within(dialogo).getByRole('button',{name:/registrar pagamento/i}));
  expect(await screen.findByText('Pagamento registrado no financeiro oficial.')).toBeInTheDocument();expect(chamadas).toBe(1);expect(within(screen.getByRole('dialog')).queryByRole('button',{name:/registrar pagamento/i})).not.toBeInTheDocument()
})
