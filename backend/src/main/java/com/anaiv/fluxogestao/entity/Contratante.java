package com.anaiv.fluxogestao.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "contratantes")
public class Contratante {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    private String nome;
    private String documento;
    private boolean ativo = true;
    protected Contratante() {}
    public Contratante(String nome, String documento) { this.nome = nome; this.documento = documento; }
    public Long getId() { return id; }
    public String getNome() { return nome; }
    public String getDocumento() { return documento; }
    public boolean isAtivo() { return ativo; }
}
