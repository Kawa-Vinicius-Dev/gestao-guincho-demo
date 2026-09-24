import { CabecalhoPagina, Painel } from '../components/ui/Pagina'
import { ANAIV, NOVIDADES, linkEmail, linkInstagram, linkWhatsapp } from './anaiv'
import logo from './anaiv-logo.webp'
import './sobre.css'

/**
 * Sobre e suporte (Kawa, 24/09/2026): quem desenvolve o sistema, como falar com
 * a ANAIV e o que foi entregue. So o administrador ve; o socorrista fala com ele.
 */
export default function SobrePage() {
  return <div className="page-enter">
    <CabecalhoPagina modulo="ANAIV" titulo="Sobre e suporte"
      descricao="Quem desenvolve o Fluxo de Gestão e como falar com a gente." />

    <div className="sobre-topo">
      <section className="panel sobre-marca" aria-label="Sobre a ANAIV">
        <div className="sobre-logo"><img src={logo} alt="ANAIV" width={200} height={200} /></div>
        <div className="sobre-marca-texto">
          <p>{ANAIV.frase}</p>
          <p className="sobre-assinatura">Desenvolvido por <strong>{ANAIV.responsavel}</strong></p>
          <a className="link-dado" href={linkInstagram()} target="_blank" rel="noreferrer">@{ANAIV.instagram} no Instagram</a>
        </div>
      </section>

      <Painel etiqueta="Suporte" titulo="Precisa de ajuda?" className="sobre-suporte">
        <p className="painel-apoio">Fale direto com a ANAIV. Se puder, mande um print da tela e diga o que estava tentando fazer.</p>
        <a className="button button-primary sobre-whatsapp" href={linkWhatsapp()} target="_blank" rel="noreferrer">
          Falar no WhatsApp · {ANAIV.whatsappExibido}
        </a>
        <a className="button button-ghost sobre-email" href={linkEmail()}>Mandar e-mail · {ANAIV.email}</a>
      </Painel>
    </div>

    <Painel etiqueta={NOVIDADES.quando} titulo="O que mudou">
      <div className="sobre-novidades">
        {NOVIDADES.grupos.map(g => <section key={g.titulo}>
          <h3>{g.titulo}</h3>
          <ul>{g.itens.map(i => <li key={i.nome}><strong>{i.nome}</strong><span>{i.texto}</span></li>)}</ul>
        </section>)}
      </div>
    </Painel>
  </div>
}
