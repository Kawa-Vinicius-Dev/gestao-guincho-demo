package com.anaiv.fluxogestao.entity;

import jakarta.persistence.*;
import static com.anaiv.fluxogestao.entity.EnumsFinanceiros.TipoCategoria;

@Entity
@Table(name = "categorias")
public class Categoria {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    private String nome;
    @Enumerated(EnumType.STRING) private TipoCategoria tipo;
    private boolean ativo = true;
    protected Categoria() {}
    public Categoria(String nome, TipoCategoria tipo) { this.nome = nome; this.tipo = tipo; }
    public Long getId() { return id; }
    public String getNome() { return nome; }
    public TipoCategoria getTipo() { return tipo; }
    public boolean isAtivo() { return ativo; }
}
