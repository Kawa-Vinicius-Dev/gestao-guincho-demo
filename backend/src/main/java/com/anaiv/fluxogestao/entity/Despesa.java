package com.anaiv.fluxogestao.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import static com.anaiv.fluxogestao.entity.EnumsFinanceiros.StatusDespesa;

@Entity
@Table(name = "despesas")
public class Despesa {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    private String descricao;
    @ManyToOne(optional = false) @JoinColumn(name = "categoria_id") private Categoria categoria;
    private BigDecimal valor;
    @Column(name = "data_lancamento") private LocalDate data;
    private LocalDate vencimento;
    @Column(name = "data_pagamento") private LocalDate dataPagamento;
    @Column(name = "forma_pagamento") private String formaPagamento;
    @ManyToOne @JoinColumn(name = "veiculo_id") private Veiculo veiculo;
    @ManyToOne @JoinColumn(name = "motorista_id") private Motorista motorista;
    private String protocolo;
    private String comprovante;
    private String observacoes;
    @Enumerated(EnumType.STRING) private StatusDespesa status;
    private boolean aprovada;
    @ManyToOne(optional = false) @JoinColumn(name = "criado_por_id") private Usuario criadoPor;
    @ManyToOne @JoinColumn(name = "aprovado_por_id") private Usuario aprovadoPor;
    @Column(name = "criado_em") private OffsetDateTime criadoEm = OffsetDateTime.now();

    protected Despesa() {}
    public Despesa(String descricao, Categoria categoria, BigDecimal valor, LocalDate data, LocalDate vencimento,
                   LocalDate dataPagamento, String formaPagamento, Veiculo veiculo, Motorista motorista,
                   String protocolo, String comprovante, String observacoes, StatusDespesa status, Usuario criadoPor) {
        this.descricao = descricao; this.categoria = categoria; this.valor = valor; this.data = data;
        this.vencimento = vencimento; this.dataPagamento = dataPagamento; this.formaPagamento = formaPagamento;
        this.veiculo = veiculo; this.motorista = motorista; this.protocolo = protocolo; this.comprovante = comprovante;
        this.observacoes = observacoes; this.status = status; this.criadoPor = criadoPor;
    }
    public void aprovar(Usuario usuario) { this.aprovada = true; this.aprovadoPor = usuario; }
    public void rejeitar(Usuario usuario) { this.aprovada = false; this.aprovadoPor = usuario; this.status = StatusDespesa.REJEITADO; }
    public void atualizarAtraso(LocalDate hoje) { if (status == StatusDespesa.PENDENTE && vencimento != null && vencimento.isBefore(hoje)) status = StatusDespesa.ATRASADO; }
    public Long getId() { return id; }
    public String getDescricao() { return descricao; }
    public Categoria getCategoria() { return categoria; }
    public BigDecimal getValor() { return valor; }
    public LocalDate getData() { return data; }
    public LocalDate getVencimento() { return vencimento; }
    public LocalDate getDataPagamento() { return dataPagamento; }
    public String getFormaPagamento() { return formaPagamento; }
    public Veiculo getVeiculo() { return veiculo; }
    public Motorista getMotorista() { return motorista; }
    public String getProtocolo() { return protocolo; }
    public String getComprovante() { return comprovante; }
    public String getObservacoes() { return observacoes; }
    public StatusDespesa getStatus() { return status; }
    public boolean isAprovada() { return aprovada; }
    public Usuario getCriadoPor() { return criadoPor; }
}
