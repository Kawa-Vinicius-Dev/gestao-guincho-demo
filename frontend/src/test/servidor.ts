import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

let contas: Record<string, unknown>[] = [{
  id: 1, contratante: { id: 1, nome: 'Porto Seguro', ativo: true }, protocolo: 'PS-1001',
  descricao: 'Remoção segurado', valorPrevisto: 800, valorRecebido: 780, diferenca: -20,
  dataCompetencia: '2026-07-20', vencimento: '2026-07-22', dataRecebimento: '2026-07-23',
  status: 'RECEBIDO', origem: 'MANUAL',
}]
let lancamentos: Record<string, unknown>[] = []
let despesas: Record<string, unknown>[] = []
let veiculos: Record<string, unknown>[] = []
let quilometragens: Record<string, unknown>[] = []

export function restaurarEstadoTeste() {
  lancamentos = []
  despesas = []
  veiculos = []
  quilometragens = []
}

export const servidor = setupServer(
  http.post('/api/auth/login', async ({ request }) => {
    const { email } = await request.json() as { email: string }
    const funcionario = email === 'funcionario@gestaoguincho.demo'
    return HttpResponse.json({
      token: funcionario ? 'token-funcionario-teste' : 'token-admin-teste',
      usuario: funcionario
        ? { id: 2, nome: 'Anderson Ribeiro', email, perfil: 'FUNCIONARIO' }
        : { id: 1, nome: 'Administrador', email: 'admin@fluxogestao.local', perfil: 'ADMINISTRADOR' },
    })
  }),
  http.post('/api/auth/logout', () => new HttpResponse(null, { status: 204 })),
  http.get('/api/auth/me', () => HttpResponse.json({
    id: 1, nome: 'Administrador', email: 'admin@fluxogestao.local', perfil: 'ADMINISTRADOR',
  })),
  http.get('/api/dashboard', () => HttpResponse.json({
    receitaRecebida: 780, receitaPrevista: 0, totalReceber: 0, totalAtrasado: 0,
    despesasPagas: 200, despesasPrevistas: 0, saldoRealizado: 580, saldoProjetado: 580,
    lucroEstimado: 580, registrosImportados: 0, quilometragemTotal: 100,
    kmRemunerado: 70, kmMorto: 30, custoKmMorto: 75, resultadoPorVeiculo: [],
  })),
  http.get('/api/contas-receber', () => HttpResponse.json(contas)),
  http.get('/api/contratantes', () => HttpResponse.json([{ id: 1, nome: 'Porto Seguro', ativo: true }])),
  http.get('/api/lancamentos', () => HttpResponse.json(lancamentos)),
  http.get('/api/receitas', () => HttpResponse.json([])),
  http.get('/api/despesas', () => HttpResponse.json(despesas)),
  http.get('/api/quilometragens', () => HttpResponse.json(quilometragens)),
  http.get('/api/veiculos', () => HttpResponse.json(veiculos)),
  http.get('/api/motoristas', () => HttpResponse.json([])),
  http.get('/api/categorias', () => HttpResponse.json([
    { id: 1, nome: 'Serviços de guincho', tipo: 'RECEITA', ativo: true },
    { id: 2, nome: 'Combustível', tipo: 'DESPESA', ativo: true },
  ])),
  http.get('/api/porto/ordens-pagamento/resumo', () => HttpResponse.json({
    quantidadeTotalOps:0,valorTotalPrevisto:0,quantidadeSemComposicao:0,valorSemComposicao:0,quantidadeConciliadas:0,valorConciliadas:0,
    quantidadeValorAbaixo:0,diferencaTotalAbaixo:0,quantidadeValorAcima:0,diferencaTotalAcima:0,quantidadeComDivergencia:0,valorTotalDivergencias:0,
    quantidadePagamentoProgramado:0,valorProgramado:0,quantidadeRecebidas:0,valorRecebido:0,quantidadeAguardandoRecebimento:0,valorAguardandoRecebimento:0,
    quantidadeVencidasNaoRecebidas:0,valorVencidoNaoRecebido:0,valorMedioPorOp:0,quantidadeOrdensServico:0,
  })),
  http.get('/api/porto/calendario',()=>HttpResponse.json([{id:1,dataPagamento:'2026-08-14',competenciaInicio:'2026-07-01',competenciaFim:'2026-07-15',descricao:'1ª quinzena',ativo:true}])),
  http.post('/api/contas-receber', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>
    const nova = { id: 2, contratante: { id: 1, nome: 'Porto Seguro', ativo: true }, status: 'PENDENTE',
      origem: 'MANUAL', protocolo: null, dataCompetencia: '2026-07-23', vencimento: '2026-08-23', ...body }
    contas = [...contas, nova]
    return HttpResponse.json(nova, { status: 201 })
  }),
  http.post('/api/receitas', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>
    const nova = { id: 11, categoria: 'Serviços de guincho', categoriaId: body.categoriaId, manual: true, ...body }
    lancamentos = [...lancamentos, {
      id: 'RECEITA-11', tipo: 'RECEITA', referenciaId: 11, descricao: body.descricao,
      categoria: 'Serviços de guincho', valor: body.valor, data: body.dataRecebimento ?? body.dataCompetencia,
      status: body.status, realizado: body.status === 'RECEBIDA', origem: 'RECEITA_MANUAL',
    }]
    return HttpResponse.json(nova, { status: 201 })
  }),
  http.post('/api/despesas', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>
    const nova = { id: 21, categoria: 'Combustível', aprovada: false, criadoPor: 'Administrador', ...body }
    despesas = [...despesas, nova]
    lancamentos = [...lancamentos, {
      id: 'DESPESA-21', tipo: 'DESPESA', referenciaId: 21, descricao: body.descricao,
      categoria: 'Combustível', valor: body.valor, data: body.dataPagamento ?? body.data,
      status: body.status, realizado: false, origem: 'DESPESA',
    }]
    return HttpResponse.json(nova, { status: 201 })
  }),
  http.patch('/api/despesas/:id/aprovar', ({ params }) => {
    const id = Number(params.id)
    despesas = despesas.map(item => Number(item.id) === id ? { ...item, aprovada: true } : item)
    lancamentos = lancamentos.map(item => Number(item.referenciaId) === id ? { ...item, realizado: item.status === 'PAGO' } : item)
    return HttpResponse.json(despesas.find(item => Number(item.id) === id) ?? { id, aprovada: true })
  }),
  http.patch('/api/despesas/:id/pagar', async ({ params, request }) => {
    const id = Number(params.id), body = await request.json() as Record<string, unknown>
    despesas = despesas.map(item => Number(item.id) === id ? { ...item, ...body, status: 'PAGO' } : item)
    lancamentos = lancamentos.map(item => Number(item.referenciaId) === id ? { ...item, data: body.dataPagamento, status: 'PAGO', realizado: true } : item)
    return HttpResponse.json(despesas.find(item => Number(item.id) === id) ?? { id, ...body, status: 'PAGO', aprovada: true })
  }),
  http.post('/api/veiculos', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>
    const novo = { id: 31, ativo: true, ...body }
    veiculos = [...veiculos, novo]
    return HttpResponse.json(novo, { status: 201 })
  }),
  http.post('/api/quilometragens', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>
    const inicial = Number(body.hodometroInicial), final = Number(body.hodometroFinal), remunerada = Number(body.quilometragemRemunerada)
    const veiculo = veiculos.find(item => Number(item.id) === Number(body.veiculoId))
    const total = final - inicial, morto = total - remunerada, custo = Number(veiculo?.custoPorKm ?? 0)
    const novo = { id: 41, veiculo: veiculo?.identificacao ?? 'Veículo', motorista: null, custoPorKm: custo,
      quilometragemTotal: total, kmMorto: morto, custoKmMorto: morto * custo, ...body }
    quilometragens = [...quilometragens, novo]
    return HttpResponse.json(novo, { status: 201 })
  }),
)
