package com.anaiv.fluxogestao.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "motoristas")
public class Motorista {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    private String nome;
    private String telefone;
    private String documento;
    private String qra;
    @OneToOne @JoinColumn(name = "usuario_id") private Usuario usuario;
    private boolean ativo = true;

    protected Motorista() {}
    public Motorista(String nome, String telefone, String documento, String qra, Usuario usuario) {
        this.nome = nome; this.telefone = telefone; this.documento = documento; this.qra = normalizarQra(qra); this.usuario = usuario;
    }
    public Long getId() { return id; }
    public String getNome() { return nome; }
    public String getTelefone() { return telefone; }
    public String getDocumento() { return documento; }
    public String getQra() { return qra; }
    public Usuario getUsuario() { return usuario; }
    public boolean isAtivo() { return ativo; }
    private String normalizarQra(String valor) { return valor == null || valor.isBlank() ? null : valor.trim().toUpperCase(java.util.Locale.ROOT); }
}
