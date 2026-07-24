package com.anaiv.fluxogestao.entity;

import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import static com.anaiv.fluxogestao.entity.EnumsFinanceiros.StatusImportacao;

@Entity
@Table(name = "importacoes")
public class Importacao {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(name = "nome_arquivo") private String nomeArquivo;
    @Column(name = "hash_arquivo") private String hashArquivo;
    @Column(name = "caminho_arquivo") private String caminhoArquivo;
    @Enumerated(EnumType.STRING) private StatusImportacao status;
    @Column(name = "texto_extraido", length = 10000) private String textoExtraido;
    @Column(name = "mensagem_erro") private String mensagemErro;
    @Column(name = "total_registros") private int totalRegistros;
    @Column(name = "criado_em") private OffsetDateTime criadoEm = OffsetDateTime.now();
    @Column(name = "confirmado_em") private OffsetDateTime confirmadoEm;
    @OneToMany(mappedBy = "importacao", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<ItemImportacao> itens = new ArrayList<>();

    protected Importacao() {}
    public Importacao(String nomeArquivo, String hashArquivo, String caminhoArquivo) {
        this.nomeArquivo = nomeArquivo; this.hashArquivo = hashArquivo; this.caminhoArquivo = caminhoArquivo;
        this.status = StatusImportacao.PROCESSANDO;
    }
    public void leituraConcluida(String texto) { this.textoExtraido = texto; this.status = StatusImportacao.AGUARDANDO_CONFERENCIA; }
    public void falhar(String mensagem) { this.mensagemErro = mensagem; this.status = StatusImportacao.ERRO_LEITURA; }
    public void adicionar(ItemImportacao item) { itens.add(item); totalRegistros = itens.size(); }
    public void confirmar() { status = StatusImportacao.CONFIRMADA; confirmadoEm = OffsetDateTime.now(); }
    public void cancelar() { status = StatusImportacao.CANCELADA; }
    public Long getId() { return id; }
    public String getNomeArquivo() { return nomeArquivo; }
    public String getHashArquivo() { return hashArquivo; }
    public String getCaminhoArquivo() { return caminhoArquivo; }
    public StatusImportacao getStatus() { return status; }
    public String getTextoExtraido() { return textoExtraido; }
    public String getMensagemErro() { return mensagemErro; }
    public int getTotalRegistros() { return totalRegistros; }
    public OffsetDateTime getCriadoEm() { return criadoEm; }
    public OffsetDateTime getConfirmadoEm() { return confirmadoEm; }
    public List<ItemImportacao> getItens() { return itens; }
}
