import { Painel } from '../components/ui/Pagina'
import type { ResultadoDaFrota } from '../dados/resultadoViaturas'
import { moeda } from '../utils/formatadores'

/**
 * Comparativo das viaturas no periodo (Kawa, 24/09/2026): o resultado de cada
 * uma depois das despesas gerais, com uma barra que diz de relance quem da lucro
 * e quem da prejuizo. Clicar na viatura abre a ficha dela logo acima.
 */
export function ComparativoDaFrota({ frota, selecionado, aoEscolher }: {
  frota: ResultadoDaFrota; selecionado: number; aoEscolher: (veiculoId: number) => void
}) {
  const maior = Math.max(1, ...frota.viaturas.map(v => Math.abs(v.resultado)))
  const prejuizo = frota.viaturas.filter(v => v.resultado < 0).length

  return <Painel titulo="Comparativo das viaturas" etiqueta={prejuizo ? `${prejuizo} com prejuízo` : 'Todas no positivo'}>
    <p className="painel-apoio">
      Receita menos as despesas da própria viatura e a parte das despesas gerais ({moeda(frota.despesasGerais)} sem viatura no período, como aluguel e contador),
      dividida pela receita de cada uma.
    </p>
    <div className="table-scroll"><table className="comparativo-frota">
      <thead><tr>
        <th>Viatura</th><th className="th-numero">Receita</th><th className="th-numero">Despesas da viatura</th>
        <th className="th-numero">Despesas gerais</th><th>Resultado</th><th className="th-numero">Margem</th>
      </tr></thead>
      <tbody>{frota.viaturas.map(v => {
        const largura = Math.abs(v.resultado) / maior * 50
        return <tr key={v.veiculoId} className={v.veiculoId === selecionado ? 'esta-escolhida' : undefined}>
          <td><button type="button" className="link-dado botao-texto" title={`Abrir a viatura ${v.veiculo}`}
            onClick={() => { aoEscolher(v.veiculoId); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>{v.veiculo}</button></td>
          <td className="col-numero">{moeda(v.receitas)}</td>
          <td className="col-numero">{moeda(v.despesasProprias)}</td>
          <td className="col-numero">{moeda(v.rateio)}</td>
          <td className="celula-resultado">
            <div className="barra-resultado" role="img" aria-label={`Resultado ${moeda(v.resultado)}`}>
              <span className={v.resultado < 0 ? 'negativo' : 'positivo'}
                style={v.resultado < 0 ? { right: '50%', width: `${largura}%` } : { left: '50%', width: `${largura}%` }} />
            </div>
            <strong className={v.resultado < 0 ? 'negative' : 'positive'}>{moeda(v.resultado)}</strong>
          </td>
          <td className="col-numero">{v.margem === null ? '—' : `${v.margem.toFixed(1).replace('.', ',')}%`}</td>
        </tr>
      })}</tbody>
    </table></div>
  </Painel>
}
