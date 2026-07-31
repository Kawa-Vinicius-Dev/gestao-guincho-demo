package com.anaiv.fluxogestao.entity;
import jakarta.persistence.*;
import java.time.OffsetDateTime;
@Entity @Table(name="registros_importados_porto")
public class RegistroImportadoPorto {
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY) private Long id;
    @ManyToOne(optional=false) @JoinColumn(name="importacao_id") private Importacao importacao;
    @Column(name="hash_registro") private String hashRegistro;
    @Enumerated(EnumType.STRING) @Column(name="tipo_relatorio") private EnumsFinanceiros.TipoRelatorioPorto tipoRelatorio;
    @Column(name="criado_em") private OffsetDateTime criadoEm=OffsetDateTime.now();
    protected RegistroImportadoPorto() {}
    public RegistroImportadoPorto(Importacao i,String hash,EnumsFinanceiros.TipoRelatorioPorto tipo){importacao=i;hashRegistro=hash;tipoRelatorio=tipo;}
}
