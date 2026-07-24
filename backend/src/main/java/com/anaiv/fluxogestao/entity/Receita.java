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

    protected Receita() {}
    public Receita(ContaReceber conta, Contratante contratante, Categoria categoria, String descricao,
                   BigDecimal valor, LocalDate competencia, LocalDate recebimento, StatusReceita status,
                   boolean recorrente, Veiculo veiculo, String observacoes) {
        this.contaReceber = conta; this.contratante = contratante; this.categoria = categoria; this.descricao = descricao;
        this.valor = valor; this.dataCompetencia = competencia; this.dataRecebimento = recebimento;
        this.status = status; this.recorrente = recorrente; this.veiculo = veiculo; this.observacoes = observacoes;
    }
    public Long getId() { return id; }
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
}
