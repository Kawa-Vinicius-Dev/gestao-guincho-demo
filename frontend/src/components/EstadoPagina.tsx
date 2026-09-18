type PropsCarregando = {
  card?: boolean
  mensagem?: string
}

export function Carregando({ card, mensagem = 'Carregando…' }: PropsCarregando = {}) {
  return (
    <div className={`page-state${card ? ' page-state-card' : ''}`} role="status">
      <span className="spinner" aria-hidden="true" />
      {mensagem ? <span className="page-state-text">{mensagem}</span> : null}
    </div>
  )
}
export function ErroPagina({mensagem,tentarNovamente}:{mensagem:string;tentarNovamente?:()=>void}){
  return <div className="page-state page-error" role="alert"><strong>Não foi possível carregar</strong><p>{mensagem}</p>
    {tentarNovamente?<button className="button button-ghost" onClick={tentarNovamente}>Tentar novamente</button>:null}</div>
}
export function Vazio({titulo,descricao}:{titulo:string;descricao:string}){
  return <div className="empty-state"><span className="empty-ledger" aria-hidden="true"/><h2>{titulo}</h2><p>{descricao}</p></div>
}
