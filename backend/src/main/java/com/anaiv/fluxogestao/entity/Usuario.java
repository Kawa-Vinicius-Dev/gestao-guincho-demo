package com.anaiv.fluxogestao.entity;

import jakarta.persistence.*;
import java.time.OffsetDateTime;

@Entity
@Table(name = "usuarios")
public class Usuario {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String nome;
    private String email;
    @Column(name = "senha_hash") private String senhaHash;
    @Enumerated(EnumType.STRING) private PerfilUsuario perfil;
    private boolean ativo = true;
    @Column(name = "criado_em") private OffsetDateTime criadoEm = OffsetDateTime.now();

    protected Usuario() {}
    public Usuario(String nome, String email, String senhaHash, PerfilUsuario perfil) {
        this.nome = nome; this.email = email.toLowerCase(); this.senhaHash = senhaHash; this.perfil = perfil;
    }
    public Long getId() { return id; }
    public String getNome() { return nome; }
    public String getEmail() { return email; }
    public String getSenhaHash() { return senhaHash; }
    public PerfilUsuario getPerfil() { return perfil; }
    public boolean isAtivo() { return ativo; }
    public void trocarSenha(String hash) { this.senhaHash = hash; }
    public void atualizar(String nome, PerfilUsuario perfil, boolean ativo) { this.nome = nome; this.perfil = perfil; this.ativo = ativo; }
}
