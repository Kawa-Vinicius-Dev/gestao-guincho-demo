/**
 * Erro com o que a tela precisa para responder: a frase para o usuario, um
 * status no estilo HTTP (401 sessao, 403 sem permissao, 409 conflito...) e, quando
 * houver, a mensagem de cada campo do formulario.
 */
export class ApiError extends Error {
  constructor(message: string, public status: number, public campos?: Record<string,string>) { super(message) }
}
