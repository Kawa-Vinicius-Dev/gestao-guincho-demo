import { ApiError, api } from '../api/http'
import type { Despesa } from '../types/modelos'
import { erroDoBanco, ou, supabase } from './cliente'
import { moduloNoSupabase } from './modo'

/**
 * Comprovantes de despesa.
 *
 * O arquivo nunca passa pelo Postgres. Binario em coluna incha o banco, sai em
 * todo backup e nao tem como ser servido sem passar por uma consulta; fica no
 * Storage, e na tabela guarda-se o caminho.
 *
 * Antes, o backend intermediava: recebia o upload com a service_role e assinava
 * a URL de leitura. Agora o browser fala direto com o Storage usando a anon key,
 * e quem decide o que ele alcanca sao as policies do bucket.
 *
 * Caminho: `despesas/<id>/<arquivo>` — as policies leem o id da despesa dali
 * para descobrir quem pode. Caminho fora dessa forma nao casa com policy
 * nenhuma, e o padrao e negar.
 */

/** Bucket proprio: o relatorio da Porto vive em `importacoes-porto`, e o bucket
 *  ja e a fronteira entre "de quem lancou" e "so do administrador". */
const BUCKET = 'comprovantes'
const TAMANHO_MAXIMO = 10 * 1024 * 1024
const TIPOS_ACEITOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']

/** A URL assinada vale o suficiente para abrir a aba, e nao mais. */
const VALIDADE_LINK_SEGUNDOS = 60

/**
 * Nome de arquivo seguro para caminho de objeto.
 *
 * O nome vem do computador de quem envia: pode ter acento, espaco, barra e
 * `..`. Barra criaria uma pasta a mais e mudaria o id que a policy le do
 * caminho; o resto so quebraria a URL.
 */
function nomeSeguro(nome: string) {
  const limpo = nome
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    // Sequencia de pontos vira um so. `..` num segmento nao escapa da pasta
    // aqui, porque o prefixo e montado por nos, mas backends de armazenamento
    // normalizam caminho de formas diferentes e nao vale depender de qual.
    .replace(/\.{2,}/g, '.')
    .replace(/-+/g, '-')
    .replace(/^[.-]+/, '')
    .slice(-80)
  return limpo || 'comprovante'
}

export async function anexarComprovante(despesa: Despesa, arquivo: File): Promise<void> {
  if (!moduloNoSupabase('despesas')) {
    const dados = new FormData()
    dados.append('arquivo', arquivo)
    await api(`/api/despesas/${despesa.id}/comprovante`, { method: 'POST', body: dados })
    return
  }

  // As mesmas validacoes do backend, agora em tres lugares: aqui (para a pessoa
  // receber o aviso antes de subir 10 MB), no bucket e na constraint da tabela.
  // O daqui e conveniencia; os outros dois e que garantem.
  if (arquivo.size === 0) throw new ApiError('Selecione um arquivo para anexar.', 400)
  if (arquivo.size > TAMANHO_MAXIMO) {
    throw new ApiError('O arquivo excede o tamanho máximo de 10 MB.', 400)
  }
  if (!TIPOS_ACEITOS.includes(arquivo.type)) {
    throw new ApiError('Envie um comprovante em PDF, JPG, PNG ou WEBP.', 400)
  }

  const caminho = `despesas/${despesa.id}/${Date.now()}-${nomeSeguro(arquivo.name)}`

  const { error } = await supabase().storage.from(BUCKET)
    .upload(caminho, arquivo, { contentType: arquivo.type, upsert: false })
  if (error) throw erroDoBanco({ message: error.message }, 'Não foi possível enviar o comprovante.')

  // O caminho so vira comprovante da despesa depois que a RPC confere quem pode.
  // Se esta parte falhar, sobra um objeto orfao no bucket — preferivel a uma
  // despesa apontando para um arquivo que ninguem conseguiu gravar.
  try {
    ou(
      await supabase().rpc('registrar_comprovante', {
        p_despesa_id: despesa.id,
        p_caminho: caminho,
        p_nome_original: arquivo.name,
        p_content_type: arquivo.type,
        p_tamanho_bytes: arquivo.size,
      }),
      'Não foi possível registrar o comprovante.',
    )
  } catch (erro) {
    await supabase().storage.from(BUCKET).remove([caminho]).catch(() => {})
    throw erro
  }
}

/**
 * Link temporario para abrir o comprovante.
 *
 * O bucket e privado: nao ha URL publica. A assinatura so e emitida se as
 * policies deixarem esta pessoa ler este objeto — pedir o link de um arquivo
 * alheio falha aqui, no servidor, nao na tela.
 */
export async function abrirComprovante(despesa: Despesa): Promise<string> {
  if (!moduloNoSupabase('despesas')) {
    const { url } = await api<{ url: string }>(`/api/despesas/${despesa.id}/comprovante`)
    return url
  }
  if (!despesa.comprovante) {
    throw new ApiError('Esta despesa não tem comprovante anexado.', 404)
  }
  const { data, error } = await supabase().storage.from(BUCKET)
    .createSignedUrl(despesa.comprovante, VALIDADE_LINK_SEGUNDOS)
  if (error || !data?.signedUrl) {
    throw new ApiError('Não foi possível abrir o comprovante.', 403)
  }
  return data.signedUrl
}

export async function removerComprovante(despesa: Despesa): Promise<void> {
  if (!moduloNoSupabase('despesas')) {
    await api(`/api/despesas/${despesa.id}/comprovante`, { method: 'DELETE' })
    return
  }
  // A tabela primeiro: se o objeto sumisse antes e a RPC recusasse, a despesa
  // ficaria apontando para um arquivo que nao existe mais.
  ou(
    await supabase().rpc('remover_comprovante', { p_despesa_id: despesa.id }),
    'Não foi possível remover o comprovante.',
  )
  if (despesa.comprovante) {
    await supabase().storage.from(BUCKET).remove([despesa.comprovante]).catch(() => {})
  }
}
