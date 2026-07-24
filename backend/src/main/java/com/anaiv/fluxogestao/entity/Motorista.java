package com.anaiv.fluxogestao.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "motoristas")
public class Motorista {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    private String nome;
    private String telefone;
    private String documento;
    @OneToOne @JoinColumn(name = "usuario_id") private Usuario usuario;
    private boolean ativo = true;

    protected Motorista() {}
    public Motorista(String nome, String telefone, String documento, Usuario usuario) {
        this.nome = nome; this.telefone = telefone; this.documento = documento; this.usuario = usuario;
    }
    public Long getId() { return id; }
    public String getNome() { return nome; }
    public String getTelefone() { return telefone; }
    public String getDocumento() { return documento; }
    public Usuario getUsuario() { return usuario; }
    public boolean isAtivo() { return ativo; }
}
