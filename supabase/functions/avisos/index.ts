// Avisos no celular (Web Push).
//
// A tela chama esta funcao logo depois de uma acao que interessa a outra
// pessoa. O texto do aviso sai do banco, e nao do corpo da chamada: quem chama
// so diz o que aconteceu e com qual registro, e a funcao confere se foi mesmo
// essa pessoa quem fez.
//
// Chamadas esperadas (todas com o JWT de quem fez a acao):
//   POST { evento: 'despesa_lancada',  id }   socorrista -> administradores
//   POST { evento: 'turno_fechado',    id }   socorrista -> administradores
//   POST { evento: 'despesa_aprovada', id }   administrador -> quem lancou
//   POST { evento: 'turno_aprovado',   id }   administrador -> socorrista do turno
//   POST { evento: 'turno_devolvido',  id }   administrador -> socorrista do turno
//   POST { evento: 'despesa_recusada', socorristaId, descricao, valor }
//        A despesa recusada ja foi apagada; como so o administrador chega aqui,
//        o que ele manda e o que vale.
//
// Segredos: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (supabase secrets set).

import { createClient } from 'jsr:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const responder = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  })

const dinheiro = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const primeiroNome = (nome?: string | null) => (nome ?? '').trim().split(/\s+/)[0] || 'Socorrista'

type Aviso = { para: string[]; titulo: string; texto: string; url: string }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return responder({ detalhe: 'Método não suportado.' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const servico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const comoUsuario = createClient(url, anon, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: sessao } = await comoUsuario.auth.getUser()
  if (!sessao?.user) return responder({ detalhe: 'Sessão inválida.' }, 401)
  const eu = sessao.user.id

  const banco = createClient(url, servico, { auth: { persistSession: false } })
  const { data: perfil } = await banco.from('perfis').select('perfil,ativo').eq('id', eu).maybeSingle()
  if (!perfil?.ativo) return responder({ detalhe: 'Sessão inválida.' }, 401)
  const souAdmin = perfil.perfil === 'ADMINISTRADOR'

  const corpo = await req.json().catch(() => ({})) as Record<string, unknown>
  const id = Number(corpo.id)

  async function administradores() {
    const { data } = await banco.from('perfis').select('id').eq('perfil', 'ADMINISTRADOR').eq('ativo', true)
    return (data ?? []).map(p => p.id as string)
  }
  async function despesa() {
    const { data } = await banco.from('despesas')
      .select('descricao,valor,criado_por,aprovada,motoristas(nome)').eq('id', id).maybeSingle()
    return data as { descricao: string; valor: number; criado_por: string; aprovada: boolean; motoristas: { nome: string } | null } | null
  }
  async function turno() {
    const { data } = await banco.from('turnos')
      .select('situacao,devolucao_motivo,data_turno,motoristas(nome,perfil_id),veiculos(identificacao)').eq('id', id).maybeSingle()
    return data as {
      situacao: string; devolucao_motivo: string | null; data_turno: string
      motoristas: { nome: string; perfil_id: string | null } | null; veiculos: { identificacao: string } | null
    } | null
  }
  const dia = (iso: string) => iso.split('-').reverse().slice(0, 2).join('/')

  let aviso: Aviso | null = null
  switch (corpo.evento) {
    case 'despesa_lancada': {
      const d = await despesa()
      if (!d || d.criado_por !== eu || d.aprovada) break
      aviso = { para: await administradores(), titulo: 'Despesa para aprovar',
        texto: `${primeiroNome(d.motoristas?.nome)} lançou ${d.descricao}: ${dinheiro.format(d.valor)}`, url: '/aprovacoes' }
      break
    }
    case 'turno_fechado': {
      const t = await turno()
      if (!t || t.motoristas?.perfil_id !== eu || t.situacao !== 'AGUARDANDO_APROVACAO') break
      aviso = { para: await administradores(), titulo: 'Turno para aprovar',
        texto: `${primeiroNome(t.motoristas?.nome)} fechou o turno de ${dia(t.data_turno)} na ${t.veiculos?.identificacao ?? 'viatura'}`, url: '/aprovacoes' }
      break
    }
    case 'despesa_aprovada': {
      if (!souAdmin) break
      const d = await despesa()
      if (!d?.aprovada) break
      aviso = { para: [d.criado_por], titulo: 'Despesa aprovada',
        texto: `${d.descricao}: ${dinheiro.format(d.valor)}`, url: '/despesas' }
      break
    }
    case 'despesa_recusada': {
      if (!souAdmin) break
      const { data: m } = await banco.from('motoristas').select('perfil_id').eq('id', Number(corpo.socorristaId)).maybeSingle()
      if (!m?.perfil_id) break
      aviso = { para: [m.perfil_id], titulo: 'Despesa recusada',
        texto: `${String(corpo.descricao ?? 'Despesa')}: ${dinheiro.format(Number(corpo.valor) || 0)}. Fale com o administrador.`, url: '/despesas' }
      break
    }
    case 'turno_aprovado':
    case 'turno_devolvido': {
      if (!souAdmin) break
      const t = await turno()
      const socorrista = t?.motoristas?.perfil_id
      if (!t || !socorrista) break
      aviso = corpo.evento === 'turno_aprovado'
        ? t.situacao === 'APROVADO'
          ? { para: [socorrista], titulo: 'Turno aprovado', texto: `Seu turno de ${dia(t.data_turno)} foi aprovado.`, url: '/turno' }
          : null
        : t.situacao === 'DEVOLVIDO'
          ? { para: [socorrista], titulo: 'Turno devolvido',
              texto: `Turno de ${dia(t.data_turno)}: ${t.devolucao_motivo ?? 'corrija e envie de novo.'}`, url: '/turno' }
          : null
      break
    }
  }
  if (!aviso || !aviso.para.length) return responder({ enviados: 0 })

  // O contato exigido pelo protocolo e uma URL https; a do proprio projeto basta.
  webpush.setVapidDetails(url,
    Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!)

  const { data: aparelhos } = await banco.from('inscricoes_de_aviso')
    .select('id,endpoint,p256dh,auth').in('usuario_id', aviso.para)
  const carga = JSON.stringify({ titulo: aviso.titulo, texto: aviso.texto, url: aviso.url })

  let enviados = 0
  await Promise.all((aparelhos ?? []).map(async a => {
    try {
      await webpush.sendNotification({ endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } }, carga)
      enviados++
    } catch (erro) {
      // 404/410: o aparelho desinstalou o app ou retirou a permissao. Sai da lista.
      const status = (erro as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) await banco.from('inscricoes_de_aviso').delete().eq('id', a.id)
    }
  }))
  return responder({ enviados })
})
