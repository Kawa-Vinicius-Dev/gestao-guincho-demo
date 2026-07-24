package com.anaiv.fluxogestao.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(name = "itens_importacao")
public class ItemImportacao {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @ManyToOne(optional = false) @JoinColumn(name = "importacao_id") private Importacao importacao;
    private String protocolo;
    @Column(name = "data_servico") private LocalDate dataServico;
    @Column(name = "veiculo_atendido") private String veiculoAtendido;
    @Column(name = "placa_atendida") private String placaAtendida;
    private String origem;
    private String destino;
    private BigDecimal valor;
    @Column(name = "km_remunerado") private BigDecimal kmRemunerado;
    @ManyToOne @JoinColumn(name = "motorista_id") private Motorista motorista;
    @ManyToOne @JoinColumn(name = "veiculo_id") private Veiculo veiculo;
    @Column(name = "previsao_pagamento") private LocalDate previsaoPagamento;
    private String observacoes;

    protected ItemImportacao() {}
    public ItemImportacao(Importacao importacao, String protocolo, LocalDate dataServico, String veiculoAtendido,
                          String placaAtendida, String origem, String destino, BigDecimal valor,
                          BigDecimal kmRemunerado, Motorista motorista, Veiculo veiculo,
                          LocalDate previsaoPagamento, String observacoes) {
        this.importacao = importacao; this.protocolo = protocolo; this.dataServico = dataServico;
        this.veiculoAtendido = veiculoAtendido; this.placaAtendida = placaAtendida; this.origem = origem;
        this.destino = destino; this.valor = valor; this.kmRemunerado = kmRemunerado;
        this.motorista = motorista; this.veiculo = veiculo; this.previsaoPagamento = previsaoPagamento;
        this.observacoes = observacoes;
    }
    public Long getId() { return id; }
    public String getProtocolo() { return protocolo; }
    public LocalDate getDataServico() { return dataServico; }
    public String getVeiculoAtendido() { return veiculoAtendido; }
    public String getPlacaAtendida() { return placaAtendida; }
    public String getOrigem() { return origem; }
    public String getDestino() { return destino; }
    public BigDecimal getValor() { return valor; }
    public BigDecimal getKmRemunerado() { return kmRemunerado; }
    public Motorista getMotorista() { return motorista; }
    public Veiculo getVeiculo() { return veiculo; }
    public LocalDate getPrevisaoPagamento() { return previsaoPagamento; }
    public String getObservacoes() { return observacoes; }
}
