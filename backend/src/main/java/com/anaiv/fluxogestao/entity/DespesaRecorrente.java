package com.anaiv.fluxogestao.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.YearMonth;

/**
 * Molde de uma despesa que se repete todo mes. Nao e a despesa em si: a despesa nasce quando o
 * mes e lancado, e a partir dai vive sozinha - pode ser aprovada, paga, corrigida ou apagada sem
 * mexer no molde, e mudar o molde nao reescreve o que ja foi lancado.
 */
@Entity
@Table(name = "despesas_recorrentes")
public class DespesaRecorrente {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    private String descricao;
    @ManyToOne(optional = false) @JoinColumn(name = "categoria_id") private Categoria categoria;
    private BigDecimal valor;
    @Column(name = "dia_vencimento") private int diaVencimento;
    @ManyToOne @JoinColumn(name = "veiculo_id") private Veiculo veiculo;
    @ManyToOne @JoinColumn(name = "motorista_id") private Motorista motorista;
    private String observacoes;
    private boolean ativo = true;
    @Column(name = "criado_em") private OffsetDateTime criadoEm = OffsetDateTime.now();

    protected DespesaRecorrente() {}
    public DespesaRecorrente(String descricao, Categoria categoria, BigDecimal valor, int diaVencimento,
                             Veiculo veiculo, Motorista motorista, String observacoes) {
        atualizar(descricao, categoria, valor, diaVencimento, veiculo, motorista, observacoes);
    }
    public void atualizar(String descricao, Categoria categoria, BigDecimal valor, int diaVencimento,
                          Veiculo veiculo, Motorista motorista, String observacoes) {
        this.descricao = descricao; this.categoria = categoria; this.valor = valor;
        this.diaVencimento = diaVencimento; this.veiculo = veiculo; this.motorista = motorista;
        this.observacoes = observacoes;
    }
    public void desativar() { this.ativo = false; }
    public void reativar() { this.ativo = true; }
    /** Dia 31 num mes de 30 cai no ultimo dia, e nao no mes seguinte. */
    public LocalDate vencimentoEm(YearMonth mes) {
        return mes.atDay(Math.min(diaVencimento, mes.lengthOfMonth()));
    }
    public Long getId() { return id; }
    public String getDescricao() { return descricao; }
    public Categoria getCategoria() { return categoria; }
    public BigDecimal getValor() { return valor; }
    public int getDiaVencimento() { return diaVencimento; }
    public Veiculo getVeiculo() { return veiculo; }
    public Motorista getMotorista() { return motorista; }
    public String getObservacoes() { return observacoes; }
    public boolean isAtivo() { return ativo; }
}
