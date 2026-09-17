/**
 * O Auxiliar: socorrista e viatura que recebem as OS da Porto que chegam sem
 * nome. Nao e uma pessoa nem um caminhao — nao tem QRA, telefone ou placa, e
 * isso nao e pendencia. As telas mostram o papel dele no lugar dos campos
 * vazios e nao oferecem excluir, porque a importacao depende dele.
 */
export const ehAuxiliar = (nome?: string | null) => (nome ?? '').trim().toUpperCase() === 'AUXILIAR'
