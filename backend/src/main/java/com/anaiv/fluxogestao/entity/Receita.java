package com.anaiv.fluxogestao.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import static com.anaiv.fluxogestao.entity.EnumsFinanceiros.StatusReceita;

@Entity
@Table(name = "receitas")
public class Receita {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @OneToOne @JoinColumn(name = "conta_receber_id") private ContaReceber contaReceber;
    @ManyToOne @JoinColumn(name = "contratante_id") private Contratante contratante;
    @ManyToOne @JoinColumn(name = "categoria_id") private Categoria categoria;
    private String descricao;
    private BigDecimal valor;
    @Column(name = "data_competencia") private LocalDate dataCompetencia;
    @Column(name = "data_recebimento") private LocalDate dataRecebimento;
    @Enumerated(EnumType.STRING) private StatusReceita status;
    private boolean recorrente;
    @ManyToOne @JoinColumn(name = "veiculo_id") private Veiculo veiculo;
    private String observacoes;
    @OneToOne @JoinColumn(name = "ordem_servico_porto_id") private OrdemServicoPorto ordemServicoPorto;
    @ManyToOne @JoinColumn(name = "ordem_pagamento_porto_id") private OrdemPagamentoPorto ordemPagamentoPorto;
    @ManyToOne @JoinColumn(name = "importacao_id") private Importacao importacao;
    @ManyToOne @JoinColumn(name = "motorista_id") private Motorista motorista;

    protected Receita() {}
    public Receita(ContaReceber conta, Contratante contratante, Categoria categoria, String descricao,
                   BigDecimal valor, LocalDate competencia, LocalDate recebimento, StatusReceita status,
                   boolean recorrente, Veiculo veiculo, String observacoes) {
        this.contaReceber = conta; this.contratante = contratante; this.categoria = categoria; this.descricao = descricao;
        this.valor = valor; this.dataCompetencia = competencia; this.dataRecebimento = recebimento;
        this.status = status; this.recorrente = recorrente; this.veiculo = veiculo; this.observacoes = observacoes;
    }
    public Long getId() { return id; }
    public void atualizarManual(Contratante contratante,Categoria categoria,String descricao,BigDecimal valor,LocalDate competencia,
        LocalDate recebimento,StatusReceita status,boolean recorrente,Veiculo veiculo,String observacoes){
        if(!isManual())throw new IllegalArgumentException("Receitas originadas da Porto ou de importação não podem ser alteradas manualmente.");
        this.contratante=contratante;this.categoria=categoria;this.descricao=descricao;this.valor=valor;this.dataCompetencia=competencia;
        this.dataRecebimento=recebimento;this.status=status;this.recorrente=recorrente;this.veiculo=veiculo;this.observacoes=observacoes;
    }
    public boolean isManual(){return contaReceber==null&&ordemServicoPorto==null&&ordemPagamentoPorto==null&&importacao==null;}
    public void sincronizarPorto(ContaReceber conta,Contratante contratante,Categoria categoria,String descricao,
        BigDecimal valor,LocalDate competencia,LocalDate recebimento,Veiculo veiculo,Motorista motorista,
        Importacao importacao,OrdemServicoPorto os,OrdemPagamentoPorto op) {
        this.contaReceber=conta;this.contratante=contratante;this.categoria=categoria;this.descricao=descricao;
        this.valor=valor;this.dataCompetencia=competencia;this.dataRecebimento=recebimento;
        this.status=StatusReceita.RECEBIDA;this.recorrente=false;if(veiculo!=null)this.veiculo=veiculo;
        if(motorista!=null)this.motorista=motorista;this.importacao=importacao;this.ordemServicoPorto=os;this.ordemPagamentoPorto=op;
    }
    public ContaReceber getContaReceber() { return contaReceber; }
    public Contratante getContratante() { return contratante; }
    public Categoria getCategoria() { return categoria; }
    public String getDescricao() { return descricao; }
    public BigDecimal getValor() { return valor; }
    public LocalDate getDataCompetencia() { return dataCompetencia; }
    public LocalDate getDataRecebimento() { return dataRecebimento; }
    public StatusReceita getStatus() { return status; }
    public boolean isRecorrente() { return recorrente; }
    public Veiculo getVeiculo() { return veiculo; }
    public String getObservacoes() { return observacoes; }
    public OrdemServicoPorto getOrdemServicoPorto(){return ordemServicoPorto;}
    public OrdemPagamentoPorto getOrdemPagamentoPorto(){return ordemPagamentoPorto;}
    public Importacao getImportacao(){return importacao;}
    public Motorista getMotorista(){return motorista;}
}
