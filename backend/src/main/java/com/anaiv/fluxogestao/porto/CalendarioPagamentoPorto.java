package com.anaiv.fluxogestao.porto;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.OffsetDateTime;

@Entity
@Table(name="calendario_pagamentos_porto")
public class CalendarioPagamentoPorto {
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY) private Long id;
    @Column(name="data_pagamento",nullable=false,unique=true) private LocalDate dataPagamento;
    @Column(name="competencia_inicio") private LocalDate competenciaInicio;
    @Column(name="competencia_fim") private LocalDate competenciaFim;
    @Column(nullable=false) private String descricao;
    @Column(nullable=false) private boolean ativo=true;
    @Column(nullable=false) private boolean estimado=false;
    @Column(name="criado_em",nullable=false) private OffsetDateTime criadoEm=OffsetDateTime.now();
    @Column(name="atualizado_em",nullable=false) private OffsetDateTime atualizadoEm=OffsetDateTime.now();
    protected CalendarioPagamentoPorto() {}
    public CalendarioPagamentoPorto(LocalDate dataPagamento,LocalDate competenciaInicio,LocalDate competenciaFim,String descricao,boolean ativo){atualizar(dataPagamento,competenciaInicio,competenciaFim,descricao,ativo);}
    /** Mexeu no ciclo, confirmou: deixa de ser projecao do sistema e passa a valer como veio da Porto. */
    public void atualizar(LocalDate dataPagamento,LocalDate competenciaInicio,LocalDate competenciaFim,String descricao,boolean ativo){this.dataPagamento=dataPagamento;this.competenciaInicio=competenciaInicio;this.competenciaFim=competenciaFim;this.descricao=descricao.trim();this.ativo=ativo;this.estimado=false;atualizadoEm=OffsetDateTime.now();}
    /** Ciclo projetado pelo padrao, para a importacao nao parar quando o calendario oficial acaba. */
    public static CalendarioPagamentoPorto projetado(LocalDate dataPagamento,LocalDate competenciaInicio,LocalDate competenciaFim,String descricao){
        CalendarioPagamentoPorto ciclo=new CalendarioPagamentoPorto(dataPagamento,competenciaInicio,competenciaFim,descricao,true);
        ciclo.estimado=true;return ciclo;
    }
    public void desativar(){ativo=false;atualizadoEm=OffsetDateTime.now();}
    public Long getId(){return id;} public LocalDate getDataPagamento(){return dataPagamento;} public String getDescricao(){return descricao;}
    public LocalDate getCompetenciaInicio(){return competenciaInicio;} public LocalDate getCompetenciaFim(){return competenciaFim;}
    public boolean isAtivo(){return ativo;} public boolean isEstimado(){return estimado;} public OffsetDateTime getCriadoEm(){return criadoEm;} public OffsetDateTime getAtualizadoEm(){return atualizadoEm;}
}
