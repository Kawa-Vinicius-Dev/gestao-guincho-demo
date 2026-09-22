// Administracao de contas de acesso.
//
// A unica coisa nesta migracao que realmente precisa de servidor. Criar conta,
// redefinir senha e dar acesso a um socorrista exigem a service_role, e essa
// chave nao pode existir no navegador: com ela o RLS e ignorado e qualquer
// visitante leria o sistema inteiro. Aqui ela fica do lado do servidor, onde o
// Supabase a injeta.
//
// Tudo o mais desta migracao roda em tabela ou RPC — nao ha invocacao gasta com
// CRUD nem com montar CSV.
//
// Chamadas esperadas (todas exigem um JWT de administrador):
//   POST { acao: 'criar',    nome, email, perfil }
//   POST { acao: 'redefinir', perfilId }
//   POST { acao: 'acesso',   motoristaId, email }
//   POST { acao: 'encerrar', perfilId }
//   POST { acao: 'excluir',  perfilId }
//   POST { acao: 'reativar', perfilId }

import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  // O supabase-js manda apikey e x-client-info em toda chamada: sem liberar os
  // dois, o navegador barra o POST na checagem de CORS e a tela so ve "Nao foi
  // possivel concluir a operacao".
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const responder = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  })

/** Senha provisoria legivel de ditar por telefone, que e como ela e repassada. */
function senhaProvisoria() {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const digitos = '23456789'
  const sorteio = (alfabeto: string, n: number) =>
    Array.from(crypto.getRandomValues(new Uint32Array(n)))
      .map(v => alfabeto[v % alfabeto.length]).join('')
  return `${sorteio(letras, 4)}-${sorteio(digitos, 4)}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return responder({ detalhe: 'Método não suportado.' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const servico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const autorizacao = req.headers.get('Authorization') ?? ''

  // Quem chama e verificado com a chave anon e o JWT dele — as policies valem.
  // A service_role so entra depois, para executar; nunca para decidir.
  const comoUsuario = createClient(url, anon, {
    global: { headers: { Authorization: autorizacao } },
  })
  const { data: sessao } = await comoUsuario.auth.getUser()
  if (!sessao?.user) return responder({ detalhe: 'Sessão inválida.' }, 401)

  const { data: perfil } = await comoUsuario
    .from('perfis').select('perfil,ativo').eq('id', sessao.user.id).maybeSingle()
  if (!perfil || !perfil.ativo || perfil.perfil !== 'ADMINISTRADOR') {
    return responder({ detalhe: 'Acesso restrito ao administrador.' }, 403)
  }

  const admin = createClient(url, servico, { auth: { persistSession: false } })
  const corpo = await req.json().catch(() => ({})) as Record<string, string>

  try {
    if (corpo.acao === 'criar' || corpo.acao === 'acesso') {
      const email = String(corpo.email ?? '').trim().toLowerCase()
      if (!email) return responder({ detalhe: 'Informe o e-mail.' }, 400)
      const senha = senhaProvisoria()

      const { data: criado, error } = await admin.auth.admin.createUser({
        email, password: senha, email_confirm: true,
        user_metadata: {
          nome: corpo.nome ?? email.split('@')[0],
          perfil: corpo.acao === 'acesso' ? 'FUNCIONARIO' : (corpo.perfil ?? 'FUNCIONARIO'),
          senha_provisoria: true,
        },
      })
      if (error) return responder({ detalhe: error.message }, 400)

      // Dar acesso a um socorrista e ligar a conta ao cadastro dele. Se este
      // passo falhar, a conta existe sem vinculo e /minha-comissao nao sabe de
      // quem e — entao a conta e desfeita.
      if (corpo.acao === 'acesso') {
        const { error: vinculo } = await admin.from('motoristas')
          .update({ perfil_id: criado.user.id }).eq('id', Number(corpo.motoristaId))
        if (vinculo) {
          await admin.auth.admin.deleteUser(criado.user.id)
          return responder({ detalhe: 'Não foi possível vincular o socorrista.' }, 400)
        }
      }

      return responder({
        usuarioId: criado.user.id,
        nome: corpo.nome ?? email.split('@')[0],
        email, senhaProvisoria: senha,
      }, 201)
    }

    if (corpo.acao === 'redefinir') {
      const id = String(corpo.perfilId ?? '')
      if (!id) return responder({ detalhe: 'Informe o usuário.' }, 400)
      const senha = senhaProvisoria()

      const { data: alterado, error } = await admin.auth.admin.updateUserById(id, { password: senha })
      if (error) return responder({ detalhe: error.message }, 400)

      await admin.from('perfis').update({ senha_provisoria: true }).eq('id', id)
      const { data: p } = await admin.from('perfis').select('nome,email').eq('id', id).maybeSingle()

      return responder({
        usuarioId: id,
        nome: p?.nome ?? '',
        email: p?.email ?? alterado.user?.email ?? '',
        senhaProvisoria: senha,
      })
    }

    // Encerrar e tirar a entrada para sempre, sem apagar historico.
    //
    // Nao da para apagar o login: `perfis.id` referencia auth.users com
    // `on delete cascade`, entao deletar o usuario derruba o perfil junto — e o
    // perfil e barrado por `despesas.criado_por` e `pagamentos_comissao.pago_por`,
    // que sao `on delete restrict` de proposito, para nunca sumir com o registro
    // de quem fez o que. O delete falharia justamente para quem ja usou o
    // sistema. Banimento permanente da o mesmo efeito pratico: a pessoa nao
    // entra mais, com senha nenhuma, e nada do que ela fez se perde.
    if (corpo.acao === 'encerrar') {
      const id = String(corpo.perfilId ?? '')
      if (!id) return responder({ detalhe: 'Informe o usuário.' }, 400)
      if (id === sessao.user.id) {
        return responder({ detalhe: 'Você não pode encerrar o seu próprio acesso.' }, 400)
      }

      // 100 anos: o painel do Supabase nao aceita "para sempre", e isto e.
      const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: '876000h' })
      if (error) return responder({ detalhe: error.message }, 400)

      // A marca que as policies leem. Sem ela, um token ainda valido entraria
      // ate expirar.
      const { error: desligou } = await admin.from('perfis').update({ ativo: false }).eq('id', id)
      if (desligou) return responder({ detalhe: desligou.message }, 400)

      // Solta o cadastro do socorrista, senao "Criar acesso" recusa dizendo que
      // ele ja tem conta — e a conta que ele tem nao serve mais para nada.
      // Servicos, comissoes e historico ficam: eles dependem do motorista, nao
      // do login.
      await admin.from('motoristas').update({ perfil_id: null }).eq('perfil_id', id)

      return responder({ usuarioId: id, encerrado: true })
    }

    // Apagar de verdade, para a conta criada errada. So passa quando a pessoa
    // nao deixou rastro: despesas.criado_por e pagamentos_comissao.pago_por sao
    // `on delete restrict`, e perfis cai por cascade quando o login vai embora.
    // Entao o banco recusa sozinho quem ja lancou algo, e ai o caminho e
    // encerrar — que tira a entrada sem apagar o que a pessoa fez.
    if (corpo.acao === 'excluir') {
      const id = String(corpo.perfilId ?? '')
      if (!id) return responder({ detalhe: 'Informe o usuário.' }, 400)
      if (id === sessao.user.id) {
        return responder({ detalhe: 'Você não pode excluir o seu próprio acesso.' }, 400)
      }

      await admin.from('motoristas').update({ perfil_id: null }).eq('perfil_id', id)

      const { error } = await admin.auth.admin.deleteUser(id)
      if (error) {
        // 23503 e a violacao de chave estrangeira; a mensagem crua nao serve
        // para quem so quer entender por que nao deu.
        const temHistorico = /foreign key|violates|23503/i.test(error.message)
        return responder({
          detalhe: temHistorico
            ? 'Esta conta já lançou coisas no sistema e não pode ser apagada sem levar junto o registro de quem fez o quê. Use "Encerrar acesso": a pessoa deixa de entrar e o histórico fica.'
            : error.message,
        }, 400)
      }

      return responder({ usuarioId: id, excluido: true })
    }

    // Desfazer um encerramento. Encerrar sem volta, num sistema com uma pessoa
    // so administrando, e pegadinha: um clique errado tirava alguem do sistema
    // para sempre.
    if (corpo.acao === 'reativar') {
      const id = String(corpo.perfilId ?? '')
      if (!id) return responder({ detalhe: 'Informe o usuário.' }, 400)

      const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: 'none' })
      if (error) return responder({ detalhe: error.message }, 400)

      const { error: ligou } = await admin.from('perfis').update({ ativo: true }).eq('id', id)
      if (ligou) return responder({ detalhe: ligou.message }, 400)

      return responder({ usuarioId: id, reativado: true })
    }

    return responder({ detalhe: 'Ação desconhecida.' }, 400)
  } catch (erro) {
    return responder({ detalhe: (erro as Error).message }, 500)
  }
})
