import { Campo } from './Campos'

/**
 * Escolha de arquivo.
 *
 * O <input type="file"> cru e desenhado pelo navegador: sai "Choose File / No
 * file chosen", em ingles, no meio de uma tela em portugues, com largura que
 * muda conforme o sistema. Aqui o campo de verdade fica escondido dentro do
 * <label> — continua sendo ele que recebe o foco e abre o seletor —, e o que
 * aparece e um botao nosso ao lado do nome do arquivo escolhido.
 */

type Props = {
  rotulo: string
  /** Extensoes aceitas, no formato do atributo accept. */
  accept: string
  aoEscolher: (arquivo: File | null) => void
  /** Nome do arquivo ja escolhido, para a tela dizer qual e. */
  nome?: string
  /**
   * Trocar esta chave remonta o campo e limpa a escolha anterior. Sem isso,
   * escolher o mesmo arquivo duas vezes seguidas nao dispara evento nenhum.
   */
  chave?: string | number
}

export function CampoArquivo({ rotulo, accept, aoEscolher, nome, chave }: Props) {
  return <Campo rotulo={rotulo}>
    <span className="campo-arquivo">
      <input key={chave} type="file" accept={accept}
        onChange={evento => aoEscolher(evento.target.files?.[0] ?? null)}/>
      <span className="campo-arquivo-botao">Escolher arquivo</span>
      <span className="campo-arquivo-nome">{nome || 'Nenhum arquivo escolhido'}</span>
    </span>
  </Campo>
}
