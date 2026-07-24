package com.anaiv.fluxogestao.entity;

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
    private boolean ativo = true;

    protected Veiculo() {}
    public Veiculo(String identificacao, String placa, String modelo, BigDecimal custoPorKm) {
        this.identificacao = identificacao; this.placa = placa.toUpperCase(); this.modelo = modelo; this.custoPorKm = custoPorKm;
    }
    public Long getId() { return id; }
    public String getIdentificacao() { return identificacao; }
    public String getPlaca() { return placa; }
    public String getModelo() { return modelo; }
    public BigDecimal getCustoPorKm() { return custoPorKm; }
    public boolean isAtivo() { return ativo; }
}
