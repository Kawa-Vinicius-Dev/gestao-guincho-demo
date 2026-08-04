package com.anaiv.fluxogestao.entity;

import jakarta.persistence.*;
import java.time.OffsetDateTime;

@Entity
@Table(name="historico_porto")
public class HistoricoPorto {
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY) private Long id;
    @ManyToOne @JoinColumn(name="ordem_pagamento_id") private OrdemPagamentoPorto ordemPagamento;
    @ManyToOne @JoinColumn(name="ordem_servico_id") private OrdemServicoPorto ordemServico;
    @ManyToOne @JoinColumn(name="usuario_id") private Usuario usuario;
    @Column(nullable=false) private String evento;
    @Column(nullable=false) private String descricao;
    @Column(name="criado_em",nullable=false) private OffsetDateTime criadoEm=OffsetDateTime.now();
    protected HistoricoPorto() {}
    public HistoricoPorto(OrdemPagamentoPorto op,OrdemServicoPorto os,Usuario usuario,String evento,String descricao){ordemPagamento=op;ordemServico=os;this.usuario=usuario;this.evento=evento;this.descricao=descricao;}
    public Long getId(){return id;} public OrdemPagamentoPorto getOrdemPagamento(){return ordemPagamento;} public OrdemServicoPorto getOrdemServico(){return ordemServico;}
    public Usuario getUsuario(){return usuario;} public String getEvento(){return evento;} public String getDescricao(){return descricao;} public OffsetDateTime getCriadoEm(){return criadoEm;}
}
