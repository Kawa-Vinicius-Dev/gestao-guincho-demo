/**
 * Filtros que sobrevivem a troca de tela.
 *
 * Quem escolhe uma OP no painel Porto, vai conferir uma ordem de servico e
 * volta, esperava reencontrar a OP escolhida — e reencontrava o mes corrente,
 * porque a tela remonta a cada navegacao e o estado nasce do zero. Guardar a
 * escolha resolve isso sem tocar em nenhuma consulta.
 *
 * sessionStorage, e nao localStorage, por dois motivos: o recorte e da sessao de
 * trabalho, nao uma preferencia permanente — amanha o mes e outro —, e o que
 * fica gravado morre junto com a aba, como ja acontece com o token. Aqui so
 * entra filtro: datas, granularidade, id de OP. Valor, receita e nome de cliente
 * continuam sem passar por armazenamento do navegador.
 *
 * Toda leitura e escrita vai em try/catch: em aba anonima, com dados de site
 * bloqueados ou em teste o acessor pode simplesmente lancar, e um filtro
 * lembrado nunca justifica derrubar a tela.
 */
const PREFIXO = 'filtro:'

export function lerFiltro<T>(chave: string, padrao: T): T {
  try {
    const bruto = sessionStorage.getItem(PREFIXO + chave)
    if (!bruto) return padrao
    const salvo = JSON.parse(bruto) as Partial<T>
    // Mescla com o padrao: uma versao antiga do filtro pode nao ter todos os
    // campos que a tela usa hoje, e faltar um deles quebraria a consulta.
    return { ...padrao, ...salvo }
  } catch { return padrao }
}

export function gravarFiltro(chave: string, valor: unknown) {
  try { sessionStorage.setItem(PREFIXO + chave, JSON.stringify(valor)) }
  catch { /* sem armazenamento a tela funciona, so nao lembra */ }
}
