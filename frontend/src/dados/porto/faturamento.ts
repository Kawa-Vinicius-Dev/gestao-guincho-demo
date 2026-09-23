import type { LinhaFaturamento } from '../../components/Graficos'
import type { Veiculo } from '../../types/modelos'
import { nomesCurtos } from '../../utils/nomes'
import { valorDaOs, type LinhaOs } from './listaOs'

/** A chave da linha de uma OS: o socorrista (id) ou a viatura (sigla); 'sem' quando falta. */
export const chaveDoGrupo = (os: LinhaOs, tipo: 'socorrista' | 'viatura') =>
  (tipo === 'socorrista' ? (os.motoristaId ? String(os.motoristaId) : '') : (os.viatura?.trim().toUpperCase() ?? '')) || 'sem'

/**
 * Faturamento por socorrista ou por viatura, no formato do antigo Painel Porto:
 * valor, servicos, quantos sem valor, e a linha sem dono por ultimo para a soma
 * fechar com o total do periodo.
 *
 * Sai da mesma lista de OS que a tela mostra (listarTodasAsOs, no modo do
 * seletor): o total das barras e o total da lista sao o mesmo numero.
 */
export function faturamentoPorGrupo(
  oss: LinhaOs[], tipo: 'socorrista' | 'viatura', veiculos: Veiculo[] = [],
): LinhaFaturamento[] {
  const curtos = nomesCurtos(oss.map(os => os.motorista))
  // A viatura casa pela sigla da Porto e, sem sigla, pela identificacao.
  const veiculoPorSigla = new Map(veiculos.map(v => [(v.siglaPorto || v.identificacao).toUpperCase(), v]))
  const grupos = new Map<string, { linha: LinhaFaturamento; semValor: number }>()
  for (const os of oss) {
    const sigla = os.viatura?.trim().toUpperCase()
    const chave = tipo === 'socorrista' ? (os.motoristaId ? String(os.motoristaId) : '') : (sigla ?? '')
    const g = grupos.get(chave) ?? {
      semValor: 0,
      linha: tipo === 'socorrista'
        ? chave
          ? { chave, rotulo: curtos.get(os.motorista ?? '') ?? os.motorista ?? '—', valor: 0, quantidade: 0,
              semVinculo: false, link: `/equipe/${chave}`, ajudaDoLink: os.motorista }
          : { chave: 'sem', rotulo: 'Sem socorrista', valor: 0, quantidade: 0, semVinculo: true,
              link: '/porto/pendencias?filtro=SOCORRISTA', ajudaDoLink: 'Ver as OS que estão sem socorrista' }
        : chave
          ? { chave, rotulo: chave, valor: 0, quantidade: 0, semVinculo: false,
              link: veiculoPorSigla.get(chave) ? `/veiculos?veiculo=${veiculoPorSigla.get(chave)!.id}` : `/veiculos?sigla=${encodeURIComponent(chave)}` }
          : { chave: 'sem', rotulo: 'Sem viatura', valor: 0, quantidade: 0, semVinculo: true,
              link: '/porto/ordens-servico?semViatura=1', ajudaDoLink: 'Ver as OS que estão sem viatura' },
    }
    g.linha.valor += valorDaOs(os)
    g.linha.quantidade = (g.linha.quantidade ?? 0) + 1
    if (os.semValor) g.semValor += 1
    grupos.set(chave, g)
  }
  return [...grupos.values()].map(({ linha, semValor }) => {
    const q = linha.quantidade ?? 0
    const servicos = `${q} ${q === 1 ? 'serviço' : 'serviços'}`
    return { ...linha, detalhe: semValor ? `${servicos} · ${semValor} sem valor` : servicos }
  })
}
