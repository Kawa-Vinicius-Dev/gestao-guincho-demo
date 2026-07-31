package com.anaiv.fluxogestao.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

@Entity @Table(name="pendencias_financeiras_porto")
public class PendenciaFinanceiraPorto {
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY) private Long id;
    @OneToOne(optional=false) @JoinColumn(name="ordem_servico_id") private OrdemServicoPorto ordemServico;
    private String tipo="SERVICO_DEVOLVIDO"; private BigDecimal valor;
    @Column(name="data_devolucao") private LocalDate dataDevolucao;
    @Enumerated(EnumType.STRING) private EnumsFinanceiros.StatusPendenciaPorto status=EnumsFinanceiros.StatusPendenciaPorto.ABERTA;
    @ManyToOne @JoinColumn(name="importacao_id") private Importacao importacao;
    @Column(name="criado_em") private OffsetDateTime criadoEm=OffsetDateTime.now();
    protected PendenciaFinanceiraPorto() {}
    public PendenciaFinanceiraPorto(OrdemServicoPorto os, BigDecimal valor, LocalDate data, Importacao importacao){
        this.ordemServico=os;this.valor=valor;this.dataDevolucao=data;this.importacao=importacao;
    }
    public void atualizar(BigDecimal valor, LocalDate data, Importacao origem){if(valor!=null)this.valor=valor;if(data!=null)dataDevolucao=data;if(origem!=null)importacao=origem;}
    public Long getId(){return id;} public OrdemServicoPorto getOrdemServico(){return ordemServico;} public String getTipo(){return tipo;}
    public BigDecimal getValor(){return valor;} public LocalDate getDataDevolucao(){return dataDevolucao;}
    public EnumsFinanceiros.StatusPendenciaPorto getStatus(){return status;}
}
