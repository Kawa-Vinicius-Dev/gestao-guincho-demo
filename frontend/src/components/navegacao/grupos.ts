/**
 * Grupos de telas: o menu do administrador mostra so o item principal de cada
 * grupo, e as telas do grupo viram abas no topo.
 *
 * Kawa, 23/09/2026: "tem muitas telas, muito conteudo; juntar o util ao
 * agradavel e diminuir a quantidade de telas". Eram 18 itens no menu; ficam 9.
 * Nenhuma tela deixou de existir: cada uma continua no mesmo endereco (links
 * antigos seguem valendo) e passou a ser uma aba do seu grupo.
 */

export interface Aba {
  /** Caminho da tela; com `busca`, a aba so vale quando a URL a traz. */
  rota: string
  rotulo: string
  /** Parametro que diferencia duas abas na mesma rota (Desempenho). */
  busca?: string
}

export interface Grupo {
  /** Rota do item do menu: a primeira aba. */
  menu: string
  titulo: string
  abas: Aba[]
}

export const GRUPOS: Grupo[] = [
  { menu: '/', titulo: 'Visão geral', abas: [
    { rota: '/', rotulo: 'Resumo' },
    { rota: '/dre', rotulo: 'DRE' },
    { rota: '/graficos', rotulo: 'Gráficos' },
  ] },
  { menu: '/lancamentos', titulo: 'Extrato', abas: [
    { rota: '/lancamentos', rotulo: 'Tudo' },
    { rota: '/despesas', rotulo: 'Despesas' },
  ] },
  { menu: '/veiculos', titulo: 'Viaturas', abas: [
    { rota: '/veiculos', rotulo: 'Viaturas' },
    { rota: '/quilometragem', rotulo: 'Quilometragem' },
    // Validade do credenciamento: viaturas e socorristas (Kawa, 24/09/2026).
    { rota: '/documentos', rotulo: 'Documentos' },
    { rota: '/desempenho', rotulo: 'Desempenho', busca: 'visao=viaturas' },
  ] },
  { menu: '/equipe', titulo: 'Socorristas', abas: [
    { rota: '/equipe', rotulo: 'Equipe' },
    { rota: '/comissoes', rotulo: 'Comissões' },
    { rota: '/desempenho', rotulo: 'Desempenho', busca: 'visao=socorristas' },
  ] },
  { menu: '/porto/ordens-servico', titulo: 'Serviços', abas: [
    { rota: '/porto/ordens-servico', rotulo: 'Todas as OS' },
    { rota: '/porto/pendencias', rotulo: 'Pendências' },
    { rota: '/contas-receber', rotulo: 'A receber' },
    { rota: '/porto/diario', rotulo: 'Calendário' },
    // Devolvidos saiu do menu (Kawa, 23/09/2026): era a pendencia antiga de
    // servico devolvido, que nenhuma importacao cria mais. O endereco
    // /porto/devolvidos continua abrindo para quem tiver o link.
  ] },
  { menu: '/porto/ordens-pagamento', titulo: 'OPs', abas: [
    { rota: '/porto/ordens-pagamento', rotulo: 'Ordens de pagamento' },
    { rota: '/porto/relatorios', rotulo: 'Relatórios' },
  ] },
]

const casa = (aba: Aba, caminho: string, busca: string) =>
  aba.rota === caminho && (!aba.busca || new URLSearchParams(busca).toString().includes(aba.busca))

/**
 * O grupo e a aba da tela atual. A ficha de um socorrista (/equipe/7) fica no
 * grupo Socorristas; Desempenho sem `visao` cai em Viaturas.
 */
export function ondeEstou(caminho: string, busca: string): { grupo: Grupo; aba: Aba } | null {
  for (const grupo of GRUPOS) {
    const aba = grupo.abas.find(a => casa(a, caminho, busca))
    if (aba) return { grupo, aba }
  }
  if (caminho.startsWith('/equipe/')) {
    const grupo = GRUPOS.find(g => g.menu === '/equipe')!
    return { grupo, aba: grupo.abas[0]! }
  }
  if (caminho === '/desempenho') {
    const grupo = GRUPOS.find(g => g.menu === '/veiculos')!
    return { grupo, aba: grupo.abas[2]! }
  }
  return null
}

export const destinoDaAba = (aba: Aba) => aba.busca ? `${aba.rota}?${aba.busca}` : aba.rota
