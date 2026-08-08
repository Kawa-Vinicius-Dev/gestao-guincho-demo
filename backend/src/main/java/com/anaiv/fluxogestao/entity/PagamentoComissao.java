package com.anaiv.fluxogestao.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

@Entity
@Table(name="pagamentos_comissao",uniqueConstraints=@UniqueConstraint(columnNames={"motorista_id","calendario_pagamento_id"}))
public class PagamentoComissao {
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY) private Long id;
    @ManyToOne(optional=false) @JoinColumn(name="motorista_id") private Motorista motorista;
    @ManyToOne(optional=false) @JoinColumn(name="calendario_pagamento_id") private CalendarioPagamentoPorto calendarioPagamento;
    @OneToOne(optional=false) @JoinColumn(name="despesa_id",unique=true) private Despesa despesa;
    @Column(name="valor_pago",nullable=false) private BigDecimal valorPago;
    @Column(name="data_pagamento",nullable=false) private LocalDate dataPagamento;
    @Column(name="forma_pagamento") private String formaPagamento;
    private String observacoes;
    @ManyToOne(optional=false) @JoinColumn(name="pago_por_id") private Usuario pagoPor;
    @Column(name="criado_em",nullable=false) private OffsetDateTime criadoEm=OffsetDateTime.now();

    protected PagamentoComissao() {}
    public PagamentoComissao(Motorista motorista,CalendarioPagamentoPorto calendarioPagamento,Despesa despesa,
        BigDecimal valorPago,LocalDate dataPagamento,String formaPagamento,String observacoes,Usuario pagoPor){
        this.motorista=motorista;this.calendarioPagamento=calendarioPagamento;this.despesa=despesa;this.valorPago=valorPago;
        this.dataPagamento=dataPagamento;this.formaPagamento=formaPagamento;this.observacoes=observacoes;this.pagoPor=pagoPor;
    }
    public Long getId(){return id;} public Motorista getMotorista(){return motorista;}
    public CalendarioPagamentoPorto getCalendarioPagamento(){return calendarioPagamento;} public Despesa getDespesa(){return despesa;}
    public BigDecimal getValorPago(){return valorPago;} public LocalDate getDataPagamento(){return dataPagamento;}
    public String getFormaPagamento(){return formaPagamento;} public String getObservacoes(){return observacoes;}
    public Usuario getPagoPor(){return pagoPor;} public OffsetDateTime getCriadoEm(){return criadoEm;}
}
