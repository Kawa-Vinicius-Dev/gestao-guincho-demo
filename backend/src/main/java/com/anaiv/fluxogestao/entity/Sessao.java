package com.anaiv.fluxogestao.entity;

import jakarta.persistence.*;
import java.time.OffsetDateTime;

@Entity
@Table(name = "sessoes")
public class Sessao {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @ManyToOne(optional = false, fetch = FetchType.EAGER) @JoinColumn(name = "usuario_id")
    private Usuario usuario;
    @Column(name = "token_hash") private String tokenHash;
    @Column(name = "expira_em") private OffsetDateTime expiraEm;
    @Column(name = "criado_em") private OffsetDateTime criadoEm = OffsetDateTime.now();

    protected Sessao() {}
    public Sessao(Usuario usuario, String tokenHash, OffsetDateTime expiraEm) {
        this.usuario = usuario; this.tokenHash = tokenHash; this.expiraEm = expiraEm;
    }
    public Long getId() { return id; }
    public Usuario getUsuario() { return usuario; }
    public String getTokenHash() { return tokenHash; }
    public OffsetDateTime getExpiraEm() { return expiraEm; }
}
