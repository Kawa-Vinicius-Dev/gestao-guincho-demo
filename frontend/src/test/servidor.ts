import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

let contas: Record<string, unknown>[] = [{
  id: 1, contratante: { id: 1, nome: 'Porto Seguro', ativo: true }, protocolo: 'PS-1001',
  descricao: 'Remoção segurado', valorPrevisto: 800, valorRecebido: 780, diferenca: -20,
  dataCompetencia: '2026-07-20', vencimento: '2026-07-22', dataRecebimento: '2026-07-23',
  status: 'RECEBIDO', origem: 'MANUAL',
}]

export const servidor = setupServer(
  http.post('/api/auth/login', () => HttpResponse.json({
    token: 'token-teste',
    usuario: { id: 1, nome: 'Administrador', email: 'admin@fluxogestao.local', perfil: 'ADMINISTRADOR' },
  })),
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
  http.get('/api/veiculos', () => HttpResponse.json([])),
  http.get('/api/motoristas', () => HttpResponse.json([])),
  http.get('/api/categorias', () => HttpResponse.json([])),
  http.post('/api/contas-receber', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>
    const nova = { id: 2, contratante: { id: 1, nome: 'Porto Seguro', ativo: true }, status: 'PENDENTE',
      origem: 'MANUAL', protocolo: null, dataCompetencia: '2026-07-23', vencimento: '2026-08-23', ...body }
    contas = [...contas, nova]
    return HttpResponse.json(nova, { status: 201 })
  }),
)
