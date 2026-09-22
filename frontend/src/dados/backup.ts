import { baixarCopiaDosDados as peloRender } from '../api/porto'
import { supabase } from './cliente'
import { hojeIso } from '../utils/formatadores'
import { moduloNoSupabase } from './modo'
import { baixarArquivoCsv, paraCsv } from './relatorios'

/**
 * Copia dos dados para guardar fora do sistema.
 *
 * O backend montava uma pasta XLSX com uma aba por tabela. Aqui sai um CSV
 * unico com as tabelas em sequencia, separadas por um cabecalho — mesma
 * finalidade (ter os dados fora do sistema), sem depender de servidor nem
 * embutir uma biblioteca de planilha no bundle.
 *
 * O RLS decide o que entra: quem nao e administrador leva so o que ja poderia
 * ver na tela. A copia nao e um atalho para escapar das policies.
 */
const TABELAS: { nome: string; titulo: string; colunas: string }[] = [
  { nome: 'veiculos', titulo: 'Veículos',
    colunas: 'id,identificacao,placa,modelo,custo_por_km,sigla_porto,ativo' },
  { nome: 'motoristas', titulo: 'Socorristas',
    colunas: 'id,nome,qra,telefone,documento,codigos_porto,veiculo_id,ativo' },
  { nome: 'contratantes', titulo: 'Contratantes', colunas: 'id,nome,documento,ativo' },
  { nome: 'categorias', titulo: 'Categorias', colunas: 'id,nome,tipo,ativo' },
  { nome: 'despesas', titulo: 'Despesas',
    colunas: 'id,descricao,categoria_id,valor,data_lancamento,vencimento,data_pagamento,'
      + 'status,natureza,veiculo_id,motorista_id,protocolo,observacoes' },
  { nome: 'receitas', titulo: 'Receitas',
    colunas: 'id,descricao,valor,data_competencia,data_recebimento,status,'
      + 'contratante_id,categoria_id,veiculo_id,motorista_id,observacoes' },
  { nome: 'contas_receber', titulo: 'Contas a receber',
    colunas: 'id,contratante_id,protocolo,descricao,valor_previsto,valor_recebido,'
      + 'data_competencia,vencimento,data_recebimento,status,origem' },
  { nome: 'quilometragens', titulo: 'Quilometragens',
    // km_total, km_morto e custo_km_morto nao sao colunas: a tela os calcula a
    // partir do hodometro e do km remunerado. A copia leva a origem.
    colunas: 'id,data_registro,veiculo_id,motorista_id,hodometro_inicial,hodometro_final,'
      + 'km_remunerado,custo_por_km,observacoes,protocolo' },
  { nome: 'ordens_pagamento_porto', titulo: 'Ordens de pagamento Porto',
    colunas: 'id,numero,valor_total,nome_codigo,data_pagamento_programada,valor_recebido,'
      + 'data_recebimento,situacao_financeira,calendario_pagamento_id' },
  { nome: 'ordens_servico_porto', titulo: 'Ordens de serviço Porto',
    colunas: 'id,numero,ordem_pagamento_id,valor_total,especialidade,sigla_viatura,'
      + 'socorrista,qra,motorista_id,data_atendimento,status_operacional,status_financeiro' },
]

export async function baixarCopiaDosDados(): Promise<void> {
  if (!moduloNoSupabase('porto')) return peloRender()

  const cliente = supabase()
  const partes = await Promise.all(TABELAS.map(async tabela => {
    const { data, error } = await cliente.from(tabela.nome).select(tabela.colunas).order('id')
    // Dizer qual tabela e o que o banco respondeu: a copia ficou meses quebrada
    // porque quatro listas pediam coluna que nao existe, e a mensagem generica
    // nao deixava ninguem descobrir onde.
    if (error) throw new Error(`Não foi possível ler ${tabela.titulo.toLowerCase()}: ${error.message}`)
    // A lista de colunas e montada em tempo de execucao, entao o supabase-js
    // nao consegue inferir o formato da linha.
    const linhas = (data ?? []) as unknown as Record<string, unknown>[]
    const colunas = tabela.colunas.split(',')
    return [
      [tabela.titulo],
      colunas,
      ...linhas.map(l => colunas.map(c => {
        const valor = l[c]
        return valor == null ? '' : String(valor)
      })),
      [],
    ]
  }))

  baixarArquivoCsv(
    paraCsv([['Cópia dos dados', hojeIso()], [], ...partes.flat()]),
    `copia-jms-${hojeIso()}.csv`)
}
