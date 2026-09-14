package com.anaiv.fluxogestao.favoritos;

import jakarta.persistence.*;
import java.time.OffsetDateTime;

/** Uma rota fixada por uma pessoa no topo do menu. Ver V21__favoritos_do_menu.sql. */
@Entity
@Table(name = "favoritos_menu")
public class FavoritoMenu {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "usuario_id", nullable = false) private Long usuarioId;
    @Column(nullable = false) private String rota;
    @Column(nullable = false) private int ordem;
    @Column(name = "criado_em") private OffsetDateTime criadoEm = OffsetDateTime.now();

    protected FavoritoMenu() {}

    public FavoritoMenu(Long usuarioId, String rota, int ordem) {
        this.usuarioId = usuarioId;
        this.rota = rota;
        this.ordem = ordem;
    }

    public Long getId() { return id; }
    public Long getUsuarioId() { return usuarioId; }
    public String getRota() { return rota; }
    public int getOrdem() { return ordem; }
}
