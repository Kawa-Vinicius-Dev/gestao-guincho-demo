import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

/**
 * Links de dado: todo nome de socorrista, viatura, OP e OS leva a tela dele.
 *
 * Kawa, 22/09/2026: "quero que as opcoes sejam clicaveis e levem para onde o dado
 * esta". Um lugar so decide o destino de cada coisa, para o mesmo nome nao levar
 * a lugares diferentes em telas diferentes. Sem o identificador, o texto aparece
 * sem link — melhor do que um link que abre a tela vazia.
 */

const vazio = <span className="dado-vazio">—</span>

/** Ficha do socorrista: servicos, comissao e despesas dele. */
export function LinkSocorrista({ id, nome, children }: { id?: number | null; nome?: string | null; children?: ReactNode }) {
  if (!nome) return vazio
  if (!id) return <>{children ?? nome}</>
  return <Link className="link-dado" to={`/equipe/${id}`} title={`Abrir a ficha de ${nome}`}>{children ?? nome}</Link>
}

/** Veiculos e custos, ja na viatura: pelo id do cadastro ou pela sigla da Porto. */
export function LinkViatura({ id, sigla, chip = false }: { id?: number | null; sigla?: string | null; chip?: boolean }) {
  if (!sigla) return vazio
  const destino = id ? `/veiculos?veiculo=${id}` : `/veiculos?sigla=${encodeURIComponent(sigla)}`
  return <Link className={chip ? 'vehicle-chip link-chip' : 'link-dado'} to={destino} title={`Abrir a viatura ${sigla}`}>{sigla}</Link>
}

/** Ordens de pagamento, com o detalhe daquela OP aberto. */
export function LinkOp({ numero, rotulo }: { numero?: string | null; rotulo?: ReactNode }) {
  if (!numero) return vazio
  return <Link className="link-dado" to={`/porto/ordens-pagamento?numero=${encodeURIComponent(numero)}`}
    title={`Abrir a OP ${numero}`}>{rotulo ?? numero}</Link>
}

/** Ordens de servico, filtrada naquela OS. */
export function LinkOs({ numero }: { numero?: string | null }) {
  if (!numero) return vazio
  return <Link className="link-dado link-os" to={`/porto/ordens-servico?os=${encodeURIComponent(numero)}`}
    title={`Abrir a OS ${numero}`}>{numero}</Link>
}
