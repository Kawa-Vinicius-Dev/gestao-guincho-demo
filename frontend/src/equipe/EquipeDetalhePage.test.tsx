import { render,screen,within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http,HttpResponse } from 'msw'
import { afterEach,beforeEach,expect,test,vi } from 'vitest'
import { servidor } from '../test/servidor'
import { escolher } from '../test/dropdown'

const TOKEN_KEY='fluxo-gestao:token:v1'
const URL_SUPABASE='https://projeto-teste.supabase.co'

/**
 * O detalhe do socorrista ja fala direto com o Supabase, enquanto o resto do App
 * neste teste continua no backend antigo — que e exatamente o estado da
 * migracao. As variaveis entram antes de importar o App porque o modo e lido na
 * importacao dos modulos de dados.
 */
async function abrirApp(){
  vi.stubEnv('VITE_SUPABASE_URL',URL_SUPABASE)
  vi.stubEnv('VITE_SUPABASE_ANON_KEY','chave-anon-de-teste')
  const { esquecerCliente }=await import('../dados/cliente')
  esquecerCliente()
  return (await import('../App')).default
}

// As duas OPs que servem de periodo: a de agosto, mais recente, abre a tela.
const ops=[
  {id:6,numero:'OP-JULHO',valor_total:200,situacao_financeira:'RECEBIDO',periodo_inicio:'2027-07-01',periodo_fim:'2027-07-31',quantidade_ordens_servico:1,valor_ordens_servico:200,divergencia:0,status_conciliacao:'CONCILIADA'},
  {id:7,numero:'OP-AGOSTO',valor_total:500,situacao_financeira:'RECEBIDO',periodo_inicio:'2027-08-01',periodo_fim:'2027-08-31',quantidade_ordens_servico:1,valor_ordens_servico:500,divergencia:0,status_conciliacao:'CONCILIADA'},
]
const comissaoAtual={ordemPagamentoId:7,periodo:'01/08/2027 a 31/08/2027',socorrista:'Ana Motorista',motoristaId:4,quantidadeServicosPagos:1,producaoPaga:500,percentualComissao:.2,comissaoBruta:100,alimentacaoAprovada:30,alimentacaoPendente:12,liquido:70,aguardandoOp:false,servicos:[{id:1,numeroOs:'OS-PAGA',especialidade:'GUINCHO',dataAtendimento:'2027-06-15',numeroOp:'OP-77',valorServico:500,comissaoServico:100}],alimentacoes:[{id:9,motoristaId:4,data:'2027-08-21',valor:30,situacao:'PENDENTE',aprovada:true},{id:10,motoristaId:4,data:'2027-08-22',valor:12,situacao:'PENDENTE',aprovada:false}]}
const detalheAtual={id:4,nome:'Ana Motorista',ativo:true,telefone:'(85) 99999-1234',email:'ana@local.test',qra:'QRA-ANA',veiculosUtilizados:['VTR-07','VTR-12'],totalServicosPrestados:2,comissao:comissaoAtual,servicos:[
  {id:2,numeroOs:'OS-PENDENTE',dataAtendimento:'2027-08-20',especialidade:'REMOÇÃO',viatura:'VTR-12',numeroOp:null,valorServico:300,statusPagamento:'AGUARDANDO_PAGAMENTO',pagoNoPeriodo:false,comissaoGerada:null},
  {id:1,numeroOs:'OS-PAGA',dataAtendimento:'2027-06-15',especialidade:'GUINCHO',viatura:'VTR-07',numeroOp:'OP-77',valorServico:500,statusPagamento:'PAGO',pagoNoPeriodo:true,comissaoGerada:100},
]}
const detalheAnterior={...detalheAtual,veiculosUtilizados:['VTR-99'],totalServicosPrestados:1,comissao:{...comissaoAtual,ordemPagamentoId:6,periodo:'01/07/2027 a 31/07/2027',quantidadeServicosPagos:0,producaoPaga:0,comissaoBruta:0,alimentacaoAprovada:0,alimentacaoPendente:0,liquido:0,aguardandoOp:true,servicos:[],alimentacoes:[]},servicos:[{id:3,numeroOs:'OS-ANTIGA',dataAtendimento:'2027-07-10',especialidade:'PANE',viatura:'VTR-99',numeroOp:null,valorServico:200,statusPagamento:'AGUARDANDO_PAGAMENTO',pagoNoPeriodo:false,comissaoGerada:null}]}

beforeEach(()=>{localStorage.clear();sessionStorage.clear();window.history.replaceState({},'','/equipe')})
afterEach(()=>vi.unstubAllEnvs())

function configurarAdmin(){
  let confirmarConsultaMotoristas!:()=>void
  const consultaMotoristas=new Promise<void>(resolve=>{confirmarConsultaMotoristas=resolve})
  sessionStorage.setItem(TOKEN_KEY,'token-admin')
  servidor.use(
    http.get('/api/auth/me',()=>HttpResponse.json({id:1,nome:'Administrador',email:'admin@local.test',perfil:'ADMINISTRADOR'})),
    http.get('/api/motoristas',()=>{confirmarConsultaMotoristas();return HttpResponse.json([{id:4,nome:'Ana Motorista',telefone:'(85) 99999-1234',qra:'QRA-ANA',usuarioId:8,ativo:true}])}),
    http.get(`${URL_SUPABASE}/rest/v1/porto_ops_conciliadas`,()=>HttpResponse.json(ops)),
    http.post(`${URL_SUPABASE}/rest/v1/rpc/detalhe_socorrista_op`,async({request})=>{
      const corpo=await request.json() as {p_op_id:number}
      return HttpResponse.json(corpo.p_op_id===6?detalheAnterior:detalheAtual)
    }),
  )
  return consultaMotoristas
}

test('administrador abre o socorrista pela Equipe e consulta composição oficial e período anterior',async()=>{
  const consultaMotoristas=configurarAdmin()
  const App=await abrirApp()
  const user=userEvent.setup()
  render(<App/>)

  await consultaMotoristas
  const cartao=(await screen.findByText('Ana Motorista')).closest('article')
  expect(cartao).not.toBeNull()
  await user.click(within(cartao!).getByRole('link',{name:/ver detalhes/i}))

  expect(await screen.findByRole('heading',{name:'Ana Motorista'})).toBeInTheDocument()
  expect(window.location.pathname).toBe('/equipe/4')
  expect(screen.getByText('Ativo')).toBeInTheDocument()
  expect(screen.getByText('(85) 99999-1234')).toBeInTheDocument()
  expect(screen.getByText('ana@local.test')).toBeInTheDocument()
  expect(screen.getByText('QRA-ANA')).toBeInTheDocument()
  expect(screen.getAllByText('VTR-07')).not.toHaveLength(0)
  expect(screen.getAllByText('VTR-12')).not.toHaveLength(0)

  const total=screen.getByText('Total de serviços prestados').closest('article')
  const pagos=screen.getByText('Serviços já pagos').closest('article')
  const resumo=screen.getByRole('region',{name:'Resumo do período'})
  expect(within(total!).getByText('2')).toBeInTheDocument()
  expect(within(pagos!).getByText('1')).toBeInTheDocument()
  expect(screen.getByText('OS-PENDENTE')).toBeInTheDocument()
  expect(screen.getByText('Comissão: aguardando pagamento')).toBeInTheDocument()
  expect(within(within(resumo).getByText('Produção paga').closest('article')!).getByText('R$ 500,00')).toBeInTheDocument()
  expect(within(within(resumo).getByText('Comissão 20%').closest('article')!).getByText('R$ 100,00')).toBeInTheDocument()
  expect(within(within(resumo).getByText('Alimentação').closest('article')!).getByText('R$ 30,00')).toBeInTheDocument()
  expect(within(within(resumo).getByText('Líquido').closest('article')!).getByText('R$ 70,00')).toBeInTheDocument()

  await escolher(user, /ordem de pagamento/i, /OP-JULHO/)
  expect(await screen.findByText('OS-ANTIGA')).toBeInTheDocument()
  expect(screen.getAllByText('VTR-99')).not.toHaveLength(0)
  expect(screen.queryByText('OS-PENDENTE')).not.toBeInTheDocument()
})

test('socorrista comum não acessa a ficha administrativa nem chama o endpoint de outro socorrista',async()=>{
  let chamadas=0
  sessionStorage.setItem(TOKEN_KEY,'token-socorrista')
  window.history.replaceState({},'','/equipe/4')
  servidor.use(
    http.get('/api/auth/me',()=>HttpResponse.json({id:2,nome:'Socorrista',email:'socorrista@local.test',perfil:'FUNCIONARIO'})),
    http.post(`${URL_SUPABASE}/rest/v1/rpc/detalhe_socorrista_op`,()=>{chamadas+=1;return HttpResponse.json(detalheAtual)}),
  )
  const App=await abrirApp()

  render(<App/>)

  expect(await screen.findByRole('heading',{name:'Despesas'})).toBeInTheDocument()
  expect(window.location.pathname).toBe('/despesas')
  expect(chamadas).toBe(0)
  expect(screen.queryByText('OS-PENDENTE')).not.toBeInTheDocument()
})
