package com.anaiv.fluxogestao.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import static com.anaiv.fluxogestao.entity.EnumsFinanceiros.*;

@Entity
@Table(name = "contas_receber")
public class ContaReceber {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @ManyToOne(optional = false) @JoinColumn(name = "contratante_id") private Contratante contratante;
    private String protocolo;
    private String descricao;
    @Column(name = "valor_previsto") private BigDecimal valorPrevisto;
    @Column(name = "valor_recebido") private BigDecimal valorRecebido;
    @Column(name = "data_competencia") private LocalDate dataCompetencia;
    private LocalDate vencimento;
    @Column(name = "data_recebimento") private LocalDate dataRecebimento;
    @Enumerated(EnumType.STRING) private StatusContaReceber status = StatusContaReceber.PENDENTE;
    @ManyToOne @JoinColumn(name = "veiculo_id") private Veiculo veiculo;
    private String observacoes;
    @Enumerated(EnumType.STRING) private OrigemLancamento origem;
    @ManyToOne @JoinColumn(name = "importacao_id") private Importacao importacao;
    @Column(name = "criado_em") private OffsetDateTime criadoEm = OffsetDateTime.now();

    protected ContaReceber() {}
    public ContaReceber(Contratante contratante, String protocolo, String descricao, BigDecimal valorPrevisto,
                        LocalDate dataCompetencia, LocalDate vencimento, Veiculo veiculo, String observacoes,
                        OrigemLancamento origem, Importacao importacao) {
        this.contratante = contratante; this.protocolo = protocolo; this.descricao = descricao;
        this.valorPrevisto = valorPrevisto; this.dataCompetencia = dataCompetencia; this.vencimento = vencimento;
        this.veiculo = veiculo; this.observacoes = observacoes; this.origem = origem; this.importacao = importacao;
    }
    public void receber(BigDecimal valor, LocalDate data) { valorRecebido = valor; dataRecebimento = data; status = StatusContaReceber.RECEBIDO; }
    public void atualizarAtraso(LocalDate hoje) { if (status == StatusContaReceber.PENDENTE && vencimento.isBefore(hoje)) status = StatusContaReceber.ATRASADO; }
    public void cancelar() { status = StatusContaReceber.CANCELADO; }
    public Long getId() { return id; }
    public Contratante getContratante() { return contratante; }
    public String getProtocolo() { return protocolo; }
    public String getDescricao() { return descricao; }
    public BigDecimal getValorPrevisto() { return valorPrevisto; }
    public BigDecimal getValorRecebido() { return valorRecebido; }
    public LocalDate getDataCompetencia() { return dataCompetencia; }
    public LocalDate getVencimento() { return vencimento; }
    public LocalDate getDataRecebimento() { return dataRecebimento; }
    public StatusContaReceber getStatus() { return status; }
    public Veiculo getVeiculo() { return veiculo; }
    public String getObservacoes() { return observacoes; }
    public OrigemLancamento getOrigem() { return origem; }
    public Importacao getImportacao() { return importacao; }
    public BigDecimal diferenca() { return valorRecebido == null ? null : valorRecebido.subtract(valorPrevisto); }
}
