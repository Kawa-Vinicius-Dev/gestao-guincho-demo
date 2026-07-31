package com.anaiv.fluxogestao.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

@Entity @Table(name="ordens_servico_porto")
public class OrdemServicoPorto {
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY) private Long id;
    @ManyToOne @JoinColumn(name="ordem_pagamento_id") private OrdemPagamentoPorto ordemPagamento;
    private String numero; @Column(name="valor_total") private BigDecimal valorTotal=BigDecimal.ZERO;
    private String especialidade; @Column(name="sigla_viatura") private String siglaViatura;
    private String socorrista; private String qra; @Column(name="data_atendimento") private LocalDate dataAtendimento;
    @Column(name="valor_km_excedente") private BigDecimal valorKmExcedente;
    @Column(name="km_morto_estimado") private BigDecimal kmMortoEstimado;
    @ManyToOne @JoinColumn(name="importacao_id") private Importacao importacao;
    @Column(name="criado_em") private OffsetDateTime criadoEm=OffsetDateTime.now();
    @Column(name="atualizado_em") private OffsetDateTime atualizadoEm=OffsetDateTime.now();
    protected OrdemServicoPorto() {}
    public OrdemServicoPorto(String numero, Importacao importacao){this.numero=numero;this.importacao=importacao;}
    public void atualizar(OrdemPagamentoPorto op, BigDecimal valor, String especialidade, String viatura,
                          String socorrista, String qra, LocalDate atendimento, BigDecimal kmExcedente,
                          BigDecimal kmMorto, Importacao origem) {
        if(op!=null) ordemPagamento=op; if(valor!=null) valorTotal=valor;
        if(valido(especialidade)) this.especialidade=especialidade; if(valido(viatura)) siglaViatura=viatura;
        if(valido(socorrista)) this.socorrista=socorrista; if(valido(qra)) this.qra=qra;
        if(atendimento!=null) dataAtendimento=atendimento; if(kmExcedente!=null) valorKmExcedente=kmExcedente;
        if(kmMorto!=null) kmMortoEstimado=kmMorto; if(origem!=null) importacao=origem; atualizadoEm=OffsetDateTime.now();
    }
    private boolean valido(String valor){return valor!=null&&!valor.isBlank();}
    public Long getId(){return id;} public OrdemPagamentoPorto getOrdemPagamento(){return ordemPagamento;}
    public String getNumero(){return numero;} public BigDecimal getValorTotal(){return valorTotal;}
    public String getEspecialidade(){return especialidade;} public String getSiglaViatura(){return siglaViatura;}
    public String getSocorrista(){return socorrista;} public String getQra(){return qra;}
    public LocalDate getDataAtendimento(){return dataAtendimento;} public BigDecimal getValorKmExcedente(){return valorKmExcedente;}
    public BigDecimal getKmMortoEstimado(){return kmMortoEstimado;}
}
