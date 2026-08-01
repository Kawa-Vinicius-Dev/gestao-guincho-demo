package com.anaiv.fluxogestao.entity;

import jakarta.persistence.*;
import java.time.OffsetDateTime;

@Entity
@Table(name="justificativas_conciliacao_porto")
public class JustificativaConciliacaoPorto {
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY) private Long id;
    @ManyToOne(optional=false) @JoinColumn(name="ordem_pagamento_id") private OrdemPagamentoPorto ordemPagamento;
    @Enumerated(EnumType.STRING) private EnumsFinanceiros.MotivoJustificativaPorto motivo;
    private String observacao;
    @ManyToOne(optional=false) @JoinColumn(name="usuario_id") private Usuario usuario;
    @Column(name="criado_em") private OffsetDateTime criadoEm=OffsetDateTime.now();

    protected JustificativaConciliacaoPorto() {}
    public JustificativaConciliacaoPorto(OrdemPagamentoPorto op,EnumsFinanceiros.MotivoJustificativaPorto motivo,String observacao,Usuario usuario){
        this.ordemPagamento=op;this.motivo=motivo;this.observacao=observacao;this.usuario=usuario;
    }
    public Long getId(){return id;} public OrdemPagamentoPorto getOrdemPagamento(){return ordemPagamento;}
    public EnumsFinanceiros.MotivoJustificativaPorto getMotivo(){return motivo;} public String getObservacao(){return observacao;}
    public Usuario getUsuario(){return usuario;} public OffsetDateTime getCriadoEm(){return criadoEm;}
}
