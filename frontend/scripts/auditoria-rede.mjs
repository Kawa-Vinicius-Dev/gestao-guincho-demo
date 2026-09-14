/**
 * Auditoria de rede num navegador de verdade.
 *
 * Responde a pergunta "alguma tela ainda fala com o Render?" do jeito mais
 * direto possivel: sobe o `dist` num servidor estatico com o mesmo rewrite de
 * SPA do vercel.json, abre o Chromium em tamanho de desktop e de celular, faz
 * login, e lista toda requisicao que saiu para `/api/` ou `onrender.com`.
 *
 * O Supabase e interceptado e respondido aqui; o Render NAO e — e justamente
 * por ficar sem resposta que ele se denuncia.
 *
 * Complementa `src/test/render-zero.test.tsx`, que faz a mesma medicao em jsdom
 * e roda junto da suite. Este aqui existe para os casos que so aparecem em
 * navegador: layout, rolagem horizontal, fontes, e a navegacao real entre rotas.
 *
 * Precisa do Playwright e de um Chromium, que nao sao dependencia do projeto:
 *
 *     npm i -D playwright --no-save
 *     npm run build
 *     node scripts/auditoria-rede.mjs
 *
 * Se o Chromium instalado nao for o da versao do Playwright, aponte o caminho:
 *
 *     CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node scripts/auditoria-rede.mjs
 */
import { chromium } from 'playwright'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const RAIZ = new URL('../dist', import.meta.url).pathname
const TIPOS = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
                '.woff2':'font/woff2', '.woff':'font/woff', '.svg':'image/svg+xml' }

const servidor = http.createServer((req, res) => {
  let arquivo = path.join(RAIZ, decodeURIComponent(req.url.split('?')[0]))
  if (!fs.existsSync(arquivo) || fs.statSync(arquivo).isDirectory()) arquivo = path.join(RAIZ, 'index.html')
  res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arquivo)] ?? 'application/octet-stream' })
  fs.createReadStream(arquivo).pipe(res)
})
await new Promise(r => servidor.listen(4173, r))

const ID = '11111111-1111-1111-1111-111111111111'
const PERFIL = { id: ID, nome: 'Administrador', email: 'admin@teste.local',
                 perfil: 'ADMINISTRADOR', ativo: true, senha_provisoria: false }
const DASHBOARD = { receitaRecebida:125000, receitaPrevista:30000, totalAtrasado:8000,
  despesasPagas:64000, despesasPrevistas:9000, saldoRealizado:61000, saldoProjetado:82000,
  registrosImportados:0, quilometragemTotal:12400, kmRemunerado:9800, kmMorto:2600,
  custoKmMorto:5200, producaoPaga:98000, comissaoSobreProducao:19600, producaoPendente:14000,
  servicosDoPeriodo:180, servicosPendentes:22, comissaoAPagar:19600,
  resultadoPorVeiculo:[{veiculoId:1,veiculo:'L168',receitas:60000,despesas:24000,resultado:36000,kmMorto:1200,custoKmMorto:2400}],
  resultadoPorSocorrista:[{motoristaId:1,socorrista:'Anderson Ribeiro',servicos:64,producao:48000,comissao:9600,despesas:900,custoTotal:10500}],
  despesasPorCategoria:[{categoriaId:1,categoria:'Combustível',valor:40000,participacao:62.5},
                        {categoriaId:2,categoria:'Manutenção',valor:24000,participacao:37.5}] }

const navegador = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {})
const resultados = []

for (const [rotulo, viewport] of [['desktop',{width:1440,height:900}],['mobile',{width:390,height:844}]]) {
  const ctx = await navegador.newContext({ viewport })
  const page = await ctx.newPage()
  const rede = []
  page.on('request', r => rede.push(r.url()))

  await page.route('**/*.supabase.co/**', async route => {
    const url = route.request().url()
    const corpo =
      url.includes('/rest/v1/perfis') ? PERFIL :
      url.includes('rpc/dashboard_resumo') ? { financeiro: DASHBOARD, porto: null } :
      url.includes('rpc/dashboard_financeiro') ? DASHBOARD :
      url.includes('/auth/v1/') ? { access_token:'jwt', refresh_token:'r', token_type:'bearer',
        expires_in:3600, user:{ id:ID, email:'admin@teste.local', aud:'authenticated' } } :
      []
    await route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(corpo) })
  })

  await page.goto('http://localhost:4173/login', { waitUntil:'networkidle' })
  await page.fill('input[name=email]', 'admin@teste.local')
  await page.fill('input[name=senha]', 'SenhaBoa@1')
  await page.getByRole('button', { name: /Entrar no sistema/ }).click()
  await page.waitForTimeout(2500)

  const larguraDoc = await page.evaluate(() => document.documentElement.scrollWidth)
  const larguraTela = await page.evaluate(() => window.innerWidth)
  const aoRender = [...new Set(rede.filter(u => /\/api\//.test(u) || /onrender\.com/.test(u)))]

  resultados.push({
    rotulo,
    entrou: page.url().endsWith('/'),
    tela: await page.locator('h1').first().textContent().catch(() => null),
    indicadores: await page.locator('.kpi').count(),
    rolagemHorizontal: larguraDoc > larguraTela,
    aoRender,
  })
  await ctx.close()
}

await navegador.close()
servidor.close()
console.log(JSON.stringify(resultados, null, 2))
process.exit(resultados.some(r => r.aoRender.length) ? 1 : 0)
