package com.anaiv.fluxogestao.cadastro;

import jakarta.persistence.*;
import java.math.BigDecimal;

@Entity
@Table(name = "veiculos")
public class Veiculo {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    private String identificacao;
    private String placa;
    private String modelo;
    @Column(name = "custo_por_km") private BigDecimal custoPorKm;
    /** Como a Porto chama esta viatura no painel do dia ("L25"). Ver V20__sigla_porto_veiculo.sql. */
    @Column(name = "sigla_porto") private String siglaPorto;
    private boolean ativo = true;

    protected Veiculo() {}
    public Veiculo(String identificacao, String placa, String modelo, BigDecimal custoPorKm) {
        this(identificacao, placa, modelo, custoPorKm, null);
    }
    public Veiculo(String identificacao, String placa, String modelo, BigDecimal custoPorKm, String siglaPorto) {
        this.identificacao = identificacao; this.placa = placa.toUpperCase(); this.modelo = modelo; this.custoPorKm = custoPorKm;
        this.siglaPorto = normalizarSigla(siglaPorto);
    }
    public void definirSiglaPorto(String siglaPorto) { this.siglaPorto = normalizarSigla(siglaPorto); }
    public void atualizar(String identificacao, String placa, String modelo, BigDecimal custoPorKm, String siglaPorto) {
        this.identificacao = identificacao; this.placa = placa.toUpperCase(); this.modelo = modelo;
        this.custoPorKm = custoPorKm; this.siglaPorto = normalizarSigla(siglaPorto);
    }
    private static String normalizarSigla(String valor) {
        return valor == null || valor.isBlank() ? null : valor.trim().toUpperCase();
    }
    public Long getId() { return id; }
    public String getIdentificacao() { return identificacao; }
    public String getPlaca() { return placa; }
    public String getModelo() { return modelo; }
    public BigDecimal getCustoPorKm() { return custoPorKm; }
    public String getSiglaPorto() { return siglaPorto; }
    public boolean isAtivo() { return ativo; }
}
