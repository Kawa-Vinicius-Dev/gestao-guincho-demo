/**
 * Qual modulo ja fala direto com o Supabase.
 *
 * A migracao e gradual e reversivel: cada modulo tem as duas implementacoes lado
 * a lado — a que chama o backend no Render e a que chama o Supabase — e esta
 * lista decide qual roda. Voltar atras e tirar um nome da variavel de ambiente e
 * republicar; nao envolve mexer em codigo nem refazer deploy do backend.
 *
 * Em VITE_SUPABASE_MODULOS, separados por virgula:
 *
 *     VITE_SUPABASE_MODULOS=auth,veiculos,motoristas
 *
 * `tudo` liga todos os que ja existem.
 *
 * IMPORTANTE: as policies do banco identificam quem chama pelo JWT do Supabase.
 * Sem `auth` na lista, a sessao continua sendo a do backend antigo e qualquer
 * consulta direta chega como visitante — o RLS nega, corretamente. Por isso
 * `moduloNoSupabase` exige `auth` junto: um modulo ligado sozinho falharia em
 * tempo de execucao, e falhar na configuracao e melhor do que falhar na tela.
 */

export type Modulo =
  | 'auth'
  | 'veiculos'
  | 'motoristas'
  | 'categorias'
  | 'contratantes'
  | 'despesas'
  | 'receitas'
  | 'dashboard'
  | 'comissoes'
  | 'favoritos'
  | 'quilometragem'
  | 'despesasFixas'
  | 'porto'
  | 'usuarios'
  | 'turnos'

const configurados = new Set(
  (import.meta.env.VITE_SUPABASE_MODULOS ?? '')
    .split(',')
    .map((nome: string) => nome.trim().toLowerCase())
    .filter(Boolean),
)

const temSupabase = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY,
)

/** A sessao vem do Supabase Auth? E o que habilita todo o resto. */
export function autenticacaoNoSupabase() {
  return temSupabase && (configurados.has('auth') || configurados.has('tudo'))
}

export function moduloNoSupabase(modulo: Modulo) {
  if (!autenticacaoNoSupabase()) return false
  // A lista da variavel e normalizada em minusculas, entao o nome do modulo
  // tambem precisa ser — senao `despesasFixas` nunca casaria com o que foi
  // digitado, e o modulo so ligaria por `tudo`.
  return configurados.has(modulo.toLowerCase()) || configurados.has('tudo')
}

/** Para a tela de configuracoes mostrar o que esta ligado, sem adivinhacao. */
export function modulosLigados(): Modulo[] {
  const todos: Modulo[] = [
    'auth', 'veiculos', 'motoristas', 'categorias', 'contratantes', 'despesas', 'receitas',
    'dashboard', 'comissoes', 'favoritos', 'quilometragem', 'despesasFixas',
    'porto', 'usuarios', 'turnos',
  ]
  if (!autenticacaoNoSupabase()) return []
  return todos.filter(m => m === 'auth' || moduloNoSupabase(m))
}
