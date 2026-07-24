package com.anaiv.fluxogestao.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;

@Entity
@Table(name = "quilometragens", uniqueConstraints = @UniqueConstraint(columnNames = {"data_registro","veiculo_id","hodometro_inicial","hodometro_final"}))
public class Quilometragem {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(name = "data_registro") private LocalDate data;
    @ManyToOne(optional = false) @JoinColumn(name = "veiculo_id") private Veiculo veiculo;
    @ManyToOne @JoinColumn(name = "motorista_id") private Motorista motorista;
    private String protocolo;
    @Column(name = "hodometro_inicial") private BigDecimal hodometroInicial;
    @Column(name = "hodometro_final") private BigDecimal hodometroFinal;
    @Column(name = "km_total") private BigDecimal quilometragemTotal;
    @Column(name = "km_remunerado") private BigDecimal quilometragemRemunerada;
    @Column(name = "km_morto") private BigDecimal kmMorto;
    @Column(name = "custo_por_km") private BigDecimal custoPorKm;
    @Column(name = "custo_km_morto") private BigDecimal custoKmMorto;
    private String observacoes;

    protected Quilometragem() {}
    public Quilometragem(LocalDate data, Veiculo veiculo, Motorista motorista, String protocolo,
                         BigDecimal inicial, BigDecimal fim, BigDecimal remunerada, String observacoes) {
        this.data = data; this.veiculo = veiculo; this.motorista = motorista; this.protocolo = protocolo;
        this.hodometroInicial = inicial; this.hodometroFinal = fim; this.quilometragemTotal = fim.subtract(inicial);
        this.quilometragemRemunerada = remunerada; this.kmMorto = quilometragemTotal.subtract(remunerada);
        this.custoPorKm = veiculo.getCustoPorKm();
        this.custoKmMorto = kmMorto.multiply(custoPorKm).setScale(2, RoundingMode.HALF_UP);
        this.observacoes = observacoes;
    }
    public Long getId() { return id; }
    public LocalDate getData() { return data; }
    public Veiculo getVeiculo() { return veiculo; }
    public Motorista getMotorista() { return motorista; }
    public String getProtocolo() { return protocolo; }
    public BigDecimal getHodometroInicial() { return hodometroInicial; }
    public BigDecimal getHodometroFinal() { return hodometroFinal; }
    public BigDecimal getQuilometragemTotal() { return quilometragemTotal; }
    public BigDecimal getQuilometragemRemunerada() { return quilometragemRemunerada; }
    public BigDecimal getKmMorto() { return kmMorto; }
    public BigDecimal getCustoPorKm() { return custoPorKm; }
    public BigDecimal getCustoKmMorto() { return custoKmMorto; }
    public String getObservacoes() { return observacoes; }
}
