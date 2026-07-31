package com.anaiv.fluxogestao.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

@Entity @Table(name = "ordens_pagamento_porto")
public class OrdemPagamentoPorto {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    private String numero;
    @Column(name="valor_total") private BigDecimal valorTotal = BigDecimal.ZERO;
    @Column(name="nome_codigo") private String nomeCodigo;
    @Column(name="data_pagamento_programada") private LocalDate dataPagamentoProgramada;
    @Column(name="valor_recebido") private BigDecimal valorRecebido;
    @Column(name="data_recebimento") private LocalDate dataRecebimento;
    @ManyToOne @JoinColumn(name="importacao_id") private Importacao importacao;
    @Column(name="criado_em") private OffsetDateTime criadoEm = OffsetDateTime.now();
    @Column(name="atualizado_em") private OffsetDateTime atualizadoEm = OffsetDateTime.now();
    protected OrdemPagamentoPorto() {}
    public OrdemPagamentoPorto(String numero, Importacao importacao) { this.numero=numero; this.importacao=importacao; }
    public void atualizar(BigDecimal valor, String nome, LocalDate programada, Importacao origem) {
        if(valor!=null) valorTotal=valor; if(nome!=null&&!nome.isBlank()) nomeCodigo=nome;
        if(programada!=null) dataPagamentoProgramada=programada; if(origem!=null) importacao=origem;
        atualizadoEm=OffsetDateTime.now();
    }
    public void confirmarRecebimento(BigDecimal valor, LocalDate data) {
        if(dataRecebimento!=null) throw new IllegalArgumentException("O recebimento desta OP já foi confirmado.");
        valorRecebido=valor; dataRecebimento=data; atualizadoEm=OffsetDateTime.now();
    }
    public Long getId(){return id;} public String getNumero(){return numero;} public BigDecimal getValorTotal(){return valorTotal;}
    public String getNomeCodigo(){return nomeCodigo;} public LocalDate getDataPagamentoProgramada(){return dataPagamentoProgramada;}
    public BigDecimal getValorRecebido(){return valorRecebido;} public LocalDate getDataRecebimento(){return dataRecebimento;}
}
