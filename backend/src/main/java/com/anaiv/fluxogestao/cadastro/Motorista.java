package com.anaiv.fluxogestao.cadastro;

import com.anaiv.fluxogestao.auth.*;
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
    @ManyToOne @JoinColumn(name = "veiculo_id") private Veiculo veiculo;
    private boolean ativo = true;

    protected Motorista() {}
    public Motorista(String nome, String telefone, String documento, String qra, Usuario usuario, Veiculo veiculo) {
        this.nome = nome; this.telefone = telefone; this.documento = documento; this.qra = normalizarQra(qra); this.usuario = usuario; this.veiculo = veiculo;
    }
    public void definirVeiculo(Veiculo veiculo) { this.veiculo = veiculo; }
    public void atualizar(String nome, String telefone, String documento, String qra, Usuario usuario, Veiculo veiculo) {
        this.nome = nome; this.telefone = telefone; this.documento = documento; this.qra = normalizarQra(qra);
        this.usuario = usuario; this.veiculo = veiculo;
    }
    /** Desativar nao apaga: as OS ja atendidas continuam apontando para ele e o historico fica de pe. */
    public void desativar() { this.ativo = false; }
    public void reativar() { this.ativo = true; }
    public Long getId() { return id; }
    public String getNome() { return nome; }
    public String getTelefone() { return telefone; }
    public String getDocumento() { return documento; }
    public String getQra() { return qra; }
    public Usuario getUsuario() { return usuario; }
    public Veiculo getVeiculo() { return veiculo; }
    public boolean isAtivo() { return ativo; }
    private String normalizarQra(String valor) { return valor == null || valor.isBlank() ? null : valor.trim().toUpperCase(java.util.Locale.ROOT); }
}
