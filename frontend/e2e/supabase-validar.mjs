/**
 * Validação de ponta a ponta contra um projeto Supabase REAL.
 *
 * Existe porque a suíte SQL (supabase/tests/*.sql) valida o banco com os papéis
 * do Supabase simulados — ela nunca encosta em PostgREST, Auth nem Storage. São
 * essas três camadas que este roteiro exercita, pelas mesmas bibliotecas que o
 * frontend usa.
 *
 * Não precisa de Docker: fala com um projeto remoto.
 *
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_ANON_KEY=sb_publishable_... \
 *   ADMIN_EMAIL=... ADMIN_SENHA=... \
 *   node supabase/tests/e2e/validar.mjs
 *
 * O administrador é criado à mão no painel (Auth -> Add user) com
 * {"perfil":"ADMINISTRADOR"} em User Metadata. O funcionário deste roteiro
 * nasce por signUp, o que de quebra testa o gatilho de provisionamento.
 *
 * Use um projeto de TESTE. O roteiro escreve dados.
 */
import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL
const ANON = process.env.SUPABASE_ANON_KEY
const ADMIN_EMAIL = process.env.ADMIN_EMAIL
const ADMIN_SENHA = process.env.ADMIN_SENHA

if (!URL || !ANON || !ADMIN_EMAIL || !ADMIN_SENHA) {
  console.error('Faltam variáveis: SUPABASE_URL, SUPABASE_ANON_KEY, ADMIN_EMAIL, ADMIN_SENHA')
  process.exit(2)
}

const cliente = () => createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })

let passou = 0, falhou = 0
const marca = (nome, ok, detalhe = '') => {
  if (ok) { passou++; console.log(`  ok    ${nome}`) }
  else { falhou++; console.log(`  FALHA ${nome}${detalhe ? ` — ${detalhe}` : ''}`) }
}
const secao = nome => console.log(`\n== ${nome}`)
/** Espera negativa: a operação TEM de ser recusada. Sucesso aqui é falha lá. */
const negado = (nome, { data, error }) => {
  const vazio = data == null || (Array.isArray(data) && data.length === 0)
  marca(nome, Boolean(error) || vazio, error ? '' : `passou indevidamente: ${JSON.stringify(data)?.slice(0, 120)}`)
}

const sufixo = Date.now().toString().slice(-8)
const FUNC_EMAIL = `func.${sufixo}@teste.local`
const FUNC_SENHA = `Teste@${sufixo}`

async function main() {
  // ---------------------------------------------------------------- Auth
  secao('Auth: cadastro, sessão, logout')
  const anon = cliente()

  const cadastro = await anon.auth.signUp({
    email: FUNC_EMAIL, password: FUNC_SENHA,
    options: { data: { nome: 'Funcionário de Teste', perfil: 'FUNCIONARIO' } },
  })
  marca('signUp de FUNCIONARIO', !cadastro.error, cadastro.error?.message)
  if (cadastro.error) {
    console.log('\n  Se o erro fala em confirmação de e-mail, desligue "Confirm email"')
    console.log('  em Authentication -> Providers -> Email no projeto de teste.')
  }

  const login = await anon.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_SENHA })
  marca('login do administrador', !login.error, login.error?.message)
  if (login.error) { fim(); return }

  marca('sessão traz access_token', Boolean(login.data.session?.access_token))
  const { data: sessao } = await anon.auth.getSession()
  marca('getSession devolve a sessão', Boolean(sessao.session))

  // O gatilho provisionar_perfil roda no mesmo commit do usuário.
  const perfilAdmin = await anon.from('perfis').select('perfil,nome').eq('id', login.data.user.id).single()
  marca('perfil do administrador provisionado como ADMINISTRADOR',
    perfilAdmin.data?.perfil === 'ADMINISTRADOR',
    `veio ${perfilAdmin.data?.perfil ?? perfilAdmin.error?.message}`)

  // ------------------------------------------------------ Visitante sem login
  secao('PostgREST: visitante sem login')
  const visitante = cliente()
  negado('visitante não lê despesas', await visitante.from('despesas').select('id').limit(1))
  negado('visitante não lê perfis', await visitante.from('perfis').select('id').limit(1))
  negado('visitante não chama o dashboard', await visitante.rpc('dashboard_resumo',
    { p_inicio: '2026-01-01', p_fim: '2026-12-31' }))

  // ------------------------------------------------------------ Administrador
  secao('PostgREST: administrador')
  const veiculo = await anon.from('veiculos').insert({
    identificacao: `E2E-${sufixo}`, placa: `E2E${sufixo.slice(-4)}`, modelo: 'Teste', custo_por_km: 2.5,
  }).select().single()
  marca('administrador cadastra veículo', !veiculo.error, veiculo.error?.message)

  const categoria = await anon.from('categorias').select('id').eq('tipo', 'DESPESA').limit(1).single()
  marca('categorias do seed existem', !categoria.error, categoria.error?.message)

  const despesa = await anon.from('despesas').insert({
    descricao: `Diesel e2e ${sufixo}`, categoria_id: categoria.data?.id, valor: 150.5,
    data_lancamento: '2026-09-15', status: 'PENDENTE', veiculo_id: veiculo.data?.id,
  }).select().single()
  marca('administrador lança despesa', !despesa.error, despesa.error?.message)

  const aprovacao = await anon.rpc('aprovar_despesa', { p_despesa_id: despesa.data?.id })
  marca('RPC aprovar_despesa', !aprovacao.error, aprovacao.error?.message)

  // ------------------------------------------------------------------- RPCs
  secao('PostgREST: RPCs de leitura')
  for (const [nome, args] of [
    ['dashboard_resumo', { p_inicio: '2026-09-01', p_fim: '2026-09-30' }],
    ['dashboard_financeiro', { p_inicio: '2026-09-01', p_fim: '2026-09-30' }],
    ['extrato_financeiro', { p_inicio: '2026-09-01', p_fim: '2026-09-30' }],
    ['porto_resumo_ops', {}],
    ['porto_dashboard', { p_inicio: '2026-09-01', p_fim: '2026-09-30' }],
  ]) {
    const r = await anon.rpc(nome, args)
    marca(`RPC ${nome}`, !r.error, r.error?.message)
  }

  // resumo_comissoes pede o ciclo de pagamento; sem um, nao ha o que resumir.
  let ciclo = (await anon.from('calendario_pagamentos_porto').select('id').limit(1).maybeSingle()).data
  if (!ciclo) {
    ciclo = (await anon.from('calendario_pagamentos_porto').insert({
      data_pagamento: '2026-09-30', competencia_inicio: '2026-09-01',
      competencia_fim: '2026-09-15', descricao: `Ciclo e2e ${sufixo}`,
    }).select().single()).data
  }
  const comissoes = await anon.rpc('resumo_comissoes', { p_calendario_id: ciclo?.id })
  marca('RPC resumo_comissoes', !comissoes.error, comissoes.error?.message)

  const detalhe = await anon.rpc('comissao_do_ciclo', { p_calendario_id: ciclo?.id })
  marca('RPC comissao_do_ciclo', !detalhe.error, detalhe.error?.message)

  // ---------------------------------------------------------------- Storage
  secao('Storage: comprovante')
  const caminho = `despesas/${despesa.data?.id}/${Date.now()}-nota.txt`
  const envio = await anon.storage.from('comprovantes')
    .upload(caminho, new Blob(['comprovante de teste'], { type: 'text/plain' }),
      { contentType: 'text/plain', upsert: false })
  marca('upload do comprovante', !envio.error, envio.error?.message)

  const registro = await anon.rpc('registrar_comprovante', {
    p_despesa_id: despesa.data?.id, p_caminho: caminho,
    p_nome_original: 'nota.txt', p_content_type: 'text/plain', p_tamanho_bytes: 20,
  })
  marca('RPC registrar_comprovante', !registro.error, registro.error?.message)

  const baixa = await anon.storage.from('comprovantes').download(caminho)
  marca('download do próprio comprovante', !baixa.error, baixa.error?.message)

  // -------------------------------------------------- Funcionário: o que é negado
  secao('Permissões: perfil FUNCIONARIO')
  const func = cliente()
  const loginFunc = await func.auth.signInWithPassword({ email: FUNC_EMAIL, password: FUNC_SENHA })
  if (loginFunc.error) {
    marca('login do funcionário', false, loginFunc.error.message)
  } else {
    marca('login do funcionário', true)
    const perfilFunc = await func.from('perfis').select('perfil').eq('id', loginFunc.data.user.id).single()
    marca('gatilho provisionou como FUNCIONARIO', perfilFunc.data?.perfil === 'FUNCIONARIO',
      `veio ${perfilFunc.data?.perfil ?? perfilFunc.error?.message}`)

    negado('funcionário não cadastra veículo', await func.from('veiculos').insert({
      identificacao: `X-${sufixo}`, placa: `XXX${sufixo.slice(-4)}`, custo_por_km: 1,
    }).select())
    negado('funcionário não aprova despesa', await func.rpc('aprovar_despesa', { p_despesa_id: despesa.data?.id }))
    negado('funcionário não alcança comprovante alheio',
      await func.storage.from('comprovantes').download(caminho))
    negado('funcionário não lê comissões de todos',
      await func.rpc('resumo_comissoes', { p_calendario_id: ciclo?.id }))
  }

  // ------------------------------------------------------------------ Logout
  secao('Auth: logout')
  const saida = await anon.auth.signOut()
  marca('signOut', !saida.error, saida.error?.message)
  negado('depois do logout, não lê mais despesas', await anon.from('despesas').select('id').limit(1))

  fim()
}

function fim() {
  console.log(`\n${'='.repeat(46)}`)
  console.log(`passou: ${passou}   falhou: ${falhou}`)
  console.log('='.repeat(46))
  process.exit(falhou > 0 ? 1 : 0)
}

main().catch(e => { console.error('\nerro inesperado:', e); process.exit(3) })
