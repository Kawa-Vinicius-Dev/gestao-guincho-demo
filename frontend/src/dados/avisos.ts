import { supabase } from './cliente'

/**
 * Avisos no celular (Web Push).
 *
 * O aparelho se inscreve uma vez (botao "Ativar avisos"), e a inscricao fica em
 * `inscricoes_de_aviso`. Depois, cada acao que interessa a outra pessoa chama a
 * Edge Function `avisos`, que monta o texto a partir do banco e envia.
 */

/** Chave publica VAPID. Nao e segredo: a privada fica so na Edge Function. */
const CHAVE_PUBLICA = 'BOt12du2VnFOzSD6CO1QQLfGu1FikH5SUIsTIiUFyVaLglmTPB42_zpLEU82tHBvh3EyNxY5KuDSbFAR6JCrljY'

export type EventoDeAviso =
  | { evento: 'despesa_lancada' | 'despesa_aprovada' | 'turno_fechado' | 'turno_aprovado' | 'turno_devolvido'; id: number }
  | { evento: 'despesa_recusada'; socorristaId: number; descricao: string; valor: number }

/** O navegador sabe receber aviso? No iPhone, so com o app na tela inicial. */
export function avisosSuportados() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export async function avisosAtivos(): Promise<boolean> {
  if (!avisosSuportados() || Notification.permission !== 'granted') return false
  const registro = await navigator.serviceWorker.getRegistration('/sw.js')
  return Boolean(await registro?.pushManager.getSubscription())
}

export async function ativarAvisos(): Promise<void> {
  if (await Notification.requestPermission() !== 'granted') {
    throw new Error('O celular não deu permissão. Libere as notificações do app nas configurações e tente de novo.')
  }
  const registro = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready
  const inscricao = (await registro.pushManager.getSubscription())
    ?? await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: CHAVE_PUBLICA })
  const { endpoint, keys } = inscricao.toJSON()
  // ponytail: aparelho compartilhado entre duas contas fica com a primeira que ativou.
  const { error } = await supabase().from('inscricoes_de_aviso')
    .upsert({ endpoint, p256dh: keys?.p256dh, auth: keys?.auth }, { onConflict: 'endpoint', ignoreDuplicates: true })
  if (error) throw new Error('Não foi possível ativar os avisos neste celular.')
}

/**
 * Manda o aviso sem esperar: aviso que falha nao pode desfazer nem travar a
 * acao que ja deu certo.
 */
export function avisar(aviso: EventoDeAviso): void {
  try { supabase().functions.invoke('avisos', { body: aviso }).catch(() => {}) } catch { /* sem cliente, sem aviso */ }
}
