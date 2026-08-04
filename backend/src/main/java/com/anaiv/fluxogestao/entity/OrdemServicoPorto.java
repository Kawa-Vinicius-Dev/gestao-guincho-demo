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
    @Enumerated(EnumType.STRING) @Column(name="status_operacional_fluxo")
    private EnumsFinanceiros.StatusOperacionalPorto statusOperacional=EnumsFinanceiros.StatusOperacionalPorto.NORMAL;
    @Enumerated(EnumType.STRING) @Column(name="status_financeiro_fluxo")
    private EnumsFinanceiros.StatusFinanceiroPorto statusFinanceiro=EnumsFinanceiros.StatusFinanceiroPorto.AGUARDANDO_OP;
    @Column(name="origem_importacao") private String origemImportacao="PORTO";
    @Column(name="data_importacao") private OffsetDateTime dataImportacao=OffsetDateTime.now();
    @Column(name="data_devolucao") private LocalDate dataDevolucao;
    @Column(name="data_finalizacao_devolucao") private LocalDate dataFinalizacaoDevolucao;
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
        if(op!=null){ordemPagamento=op;if(statusFinanceiro!=EnumsFinanceiros.StatusFinanceiroPorto.RECEBIDO)statusFinanceiro=EnumsFinanceiros.StatusFinanceiroPorto.PAGAMENTO_PROGRAMADO;} if(valor!=null) valorTotal=valor;
        if(valido(especialidade)) this.especialidade=especialidade; if(valido(viatura)) siglaViatura=viatura;
        if(valido(socorrista)) this.socorrista=socorrista; if(valido(qra)) this.qra=qra;
        if(atendimento!=null) dataAtendimento=atendimento; if(kmExcedente!=null) valorKmExcedente=kmExcedente;
        if(kmMorto!=null) kmMortoEstimado=kmMorto; if(origem!=null) importacao=origem; atualizadoEm=OffsetDateTime.now();
    }
    public void finalizarDevolucao(BigDecimal valor,LocalDate devolucao,LocalDate finalizacao,Importacao origem){
        if(valor!=null)valorTotal=valor;if(devolucao!=null)dataDevolucao=devolucao;
        dataFinalizacaoDevolucao=finalizacao==null?devolucao:finalizacao;statusOperacional=EnumsFinanceiros.StatusOperacionalPorto.DEVOLVIDO_FINALIZADO;
        if(origem!=null)importacao=origem;atualizadoEm=OffsetDateTime.now();
    }
    public void marcarRecebida(){statusFinanceiro=EnumsFinanceiros.StatusFinanceiroPorto.RECEBIDO;atualizadoEm=OffsetDateTime.now();}
    public void marcarPendente(EnumsFinanceiros.StatusFinanceiroPorto financeiro){statusOperacional=EnumsFinanceiros.StatusOperacionalPorto.PENDENTE_PORTO;statusFinanceiro=financeiro;atualizadoEm=OffsetDateTime.now();}
    public void resolverPendencia(){if(statusOperacional==EnumsFinanceiros.StatusOperacionalPorto.PENDENTE_PORTO)statusOperacional=EnumsFinanceiros.StatusOperacionalPorto.NORMAL;
        if(statusFinanceiro==EnumsFinanceiros.StatusFinanceiroPorto.BLOQUEADO_PARA_PAGAMENTO||statusFinanceiro==EnumsFinanceiros.StatusFinanceiroPorto.VALOR_DIVERGENTE)
            statusFinanceiro=ordemPagamento==null?EnumsFinanceiros.StatusFinanceiroPorto.AGUARDANDO_OP:ordemPagamento.getDataRecebimento()==null?EnumsFinanceiros.StatusFinanceiroPorto.PAGAMENTO_PROGRAMADO:EnumsFinanceiros.StatusFinanceiroPorto.RECEBIDO;
        atualizadoEm=OffsetDateTime.now();}
    private boolean valido(String valor){return valor!=null&&!valor.isBlank();}
    public Long getId(){return id;} public OrdemPagamentoPorto getOrdemPagamento(){return ordemPagamento;}
    public String getNumero(){return numero;} public BigDecimal getValorTotal(){return valorTotal;}
    public String getEspecialidade(){return especialidade;} public String getSiglaViatura(){return siglaViatura;}
    public String getSocorrista(){return socorrista;} public String getQra(){return qra;}
    public LocalDate getDataAtendimento(){return dataAtendimento;} public BigDecimal getValorKmExcedente(){return valorKmExcedente;}
    public BigDecimal getKmMortoEstimado(){return kmMortoEstimado;}
    public EnumsFinanceiros.StatusOperacionalPorto getStatusOperacional(){return statusOperacional;}
    public EnumsFinanceiros.StatusFinanceiroPorto getStatusFinanceiro(){return statusFinanceiro;}
    public String getOrigemImportacao(){return origemImportacao;} public OffsetDateTime getDataImportacao(){return dataImportacao;}
    public LocalDate getDataDevolucao(){return dataDevolucao;} public LocalDate getDataFinalizacaoDevolucao(){return dataFinalizacaoDevolucao;}
}
