/**
 * A ANAIV, que desenvolve o Fluxo de Gestao, e como falar com ela.
 *
 * Kawa, 24/09/2026: o WhatsApp de suporte ainda e o pessoal dele e vai mudar.
 * E so trocar aqui: a pagina Sobre e suporte le tudo deste arquivo.
 */
export const ANAIV = {
  nome: 'ANAIV',
  responsavel: 'Kawã Viana',
  frase: 'A ANAIV é a startup que desenvolve o Fluxo de Gestão: um sistema feito para empresas de guincho '
    + 'que prestam serviço à Porto Seguro, do serviço importado da Porto até o lucro de cada viatura.',
  /** Com DDI e DDD, so numeros: e o formato que o link do WhatsApp pede. */
  whatsapp: '5581996073018',
  whatsappExibido: '(81) 99607-3018',
  email: 'kawa.vinicius.dev@gmail.com',
  instagram: 'anaiv.tech',
}

const MENSAGEM = 'Olá, preciso de suporte no Fluxo de Gestão.'

export const linkWhatsapp = () => `https://wa.me/${ANAIV.whatsapp}?text=${encodeURIComponent(MENSAGEM)}`
export const linkEmail = () => `mailto:${ANAIV.email}?subject=${encodeURIComponent('Suporte · Fluxo de Gestão')}`
export const linkInstagram = () => `https://instagram.com/${ANAIV.instagram}`

export interface GrupoDeNovidades {
  titulo: string
  itens: { nome: string; texto: string }[]
}

/** O que foi entregue em setembro de 2026, o mesmo do PDF enviado ao cliente. */
export const NOVIDADES: { quando: string; grupos: GrupoDeNovidades[] } = {
  quando: 'Setembro de 2026',
  grupos: [
    { titulo: 'Financeiro', itens: [
      { nome: 'Juros em despesa fixa', texto: 'Pagou uma fixa com atraso? Informe o valor pago e a diferença entra sozinha na categoria Juros.' },
      { nome: 'Relatórios em uma folha', texto: 'Relatório operacional serviço a serviço, sem valores, e DRE simplificada numa folha, com o detalhe no Excel.' },
      { nome: 'Resultado real de cada viatura', texto: 'As despesas gerais são divididas entre as viaturas pela receita de cada uma.' },
      { nome: 'Números que levam ao detalhe', texto: 'Na Visão geral, na DRE e na Frota, cada valor abre a lista que ele soma.' },
    ] },
    { titulo: 'Porto Seguro', itens: [
      { nome: 'Contestações', texto: 'Com a tabela de preços, o sistema aponta o que a Porto não pagou ou pagou a menos.' },
      { nome: 'Filtros rápidos', texto: 'Nas telas de Pendências, Serviços e OPs, os quadros de números filtram a lista.' },
    ] },
    { titulo: 'Viaturas', itens: [
      { nome: 'Checklist com fotos', texto: 'Fotos obrigatórias da viatura no começo do turno, apagadas 7 dias depois de aprovadas.' },
      { nome: 'Documentos e vistoria da Porto', texto: 'Aviso 30 dias antes de vencer e o mês da vistoria pelo final da placa.' },
      { nome: 'Km dos serviços e km morto', texto: 'O socorrista lança o km do GPS de cada OS; o km morto sai sozinho na aprovação do turno.' },
      { nome: 'Manutenção por km e danos', texto: 'Quanto falta para cada troca, e todo dano do checklist vira pendência até o conserto.' },
    ] },
    { titulo: 'Segurança', itens: [
      { nome: 'Cópia de segurança diária', texto: 'Todo dia às 3h, criptografada e guardada fora do sistema, com os últimos 30 dias.' },
    ] },
  ],
}
