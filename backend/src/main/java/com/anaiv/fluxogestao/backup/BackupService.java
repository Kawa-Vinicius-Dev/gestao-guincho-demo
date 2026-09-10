package com.anaiv.fluxogestao.backup;

import com.anaiv.fluxogestao.cadastro.*;
import com.anaiv.fluxogestao.financeiro.*;
import com.anaiv.fluxogestao.porto.*;
import com.anaiv.fluxogestao.cadastro.CadastroDtos.*;
import com.anaiv.fluxogestao.financeiro.FinanceiroDtos.*;
import com.anaiv.fluxogestao.porto.PortoDtos.*;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.Date;
import java.util.List;
import java.util.function.Function;

/**
 * Copia de tudo num arquivo so. O banco fica num plano gratuito sem backup automatico, e refazer
 * meses de OP, associacao e despesa na mao nao seria viavel - isto e o que o dono guarda fora do
 * Supabase. Nao substitui um dump do banco: e leitura em Excel, para conferir e reconstruir.
 */
@Service
public class BackupService {
    private final PortoService porto;
    private final FinanceiroService financeiro;
    private final CadastroService cadastros;
    private final CalendarioPortoService calendario;
    private final DespesaRecorrenteService recorrentes;
    private final QuilometragemService quilometragens;

    public BackupService(PortoService porto, FinanceiroService financeiro, CadastroService cadastros,
                         CalendarioPortoService calendario, DespesaRecorrenteService recorrentes,
                         QuilometragemService quilometragens) {
        this.porto = porto; this.financeiro = financeiro; this.cadastros = cadastros;
        this.calendario = calendario; this.recorrentes = recorrentes; this.quilometragens = quilometragens;
    }

    @Transactional public byte[] excel() {
        List<OrdemPagamentoResponse> ops = porto.listarOps();
        List<OrdemServicoResponse> oss = porto.listarOss();
        List<ReceitaResponse> receitas = financeiro.listarReceitas();
        List<DespesaResponse> despesas = financeiro.listarDespesas();
        List<ContaResponse> contas = financeiro.listarContas(null, null);
        List<MotoristaResponse> socorristas = cadastros.motoristas();
        List<VeiculoResponse> veiculos = cadastros.veiculos();
        List<QuilometragemResponse> kms = quilometragens.listar();
        List<CalendarioResponse> ciclos = calendario.listar();
        List<DespesaRecorrenteResponse> fixas = recorrentes.listar();
        try (XSSFWorkbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Estilos e = new Estilos(wb);
            resumo(wb, e, List.of(
                new Contagem("Ordens de pagamento", ops.size()), new Contagem("Ordens de serviço", oss.size()),
                new Contagem("Receitas", receitas.size()), new Contagem("Despesas", despesas.size()),
                new Contagem("Contas a receber", contas.size()), new Contagem("Socorristas", socorristas.size()),
                new Contagem("Veículos", veiculos.size()), new Contagem("Quilometragem", kms.size()),
                new Contagem("Calendário Porto", ciclos.size()), new Contagem("Despesas fixas", fixas.size())));
            aba(wb, e, "Ordens de pagamento",
                new String[]{"Número","Valor informado","Data programada","Valor recebido","Data do recebimento","Situação","Qtd. de OS","Soma das OS","Diferença","Conciliação","Período"},
                ops, x -> new Object[]{x.numero(), x.valorTotal(), x.dataPagamentoProgramada(), x.valorRecebido(), x.dataRecebimento(),
                    x.situacao(), x.quantidadeOrdensServico(), x.valorOrdensServico(), x.divergencia(), x.statusConciliacao(), x.periodoFinanceiro()});
            aba(wb, e, "Ordens de serviço",
                new String[]{"Número","OP","Atendimento","Especialidade","Nome no relatório","QRA","Viatura","Socorrista vinculado","Valor","Status operacional","Status financeiro","Previsão original","Ciclo efetivo"},
                oss, x -> new Object[]{x.numero(), x.ordemPagamento(), x.dataAtendimento(), x.especialidade(), x.socorrista(), x.qra(),
                    x.viatura(), x.motorista(), x.valorTotal(), x.statusOperacional(), x.statusFinanceiro(), x.dataPrevistaOriginal(), x.dataEfetivaPagamento()});
            aba(wb, e, "Receitas",
                new String[]{"Descrição","Valor","Competência","Recebimento","Status","Contratante","Categoria","Veículo","Origem"},
                receitas, x -> new Object[]{x.descricao(), x.valor(), x.dataCompetencia(), x.dataRecebimento(), x.status(),
                    x.contratante(), x.categoria(), x.veiculo(), x.manual() ? "Manual" : "Importada"});
            aba(wb, e, "Despesas",
                new String[]{"Descrição","Categoria","Valor","Data","Vencimento","Pagamento","Forma","Veículo","Socorrista","Status","Aprovada","Lançada por"},
                despesas, x -> new Object[]{x.descricao(), x.categoria(), x.valor(), x.data(), x.vencimento(), x.dataPagamento(),
                    x.formaPagamento(), x.veiculo(), x.motorista(), x.status(), x.aprovada() ? "Sim" : "Não", x.criadoPor()});
            aba(wb, e, "Contas a receber",
                new String[]{"Descrição","Contratante","Protocolo","Valor previsto","Valor recebido","Competência","Vencimento","Recebimento","Status","Origem"},
                contas, x -> new Object[]{x.descricao(), x.contratante() == null ? null : x.contratante().nome(), x.protocolo(),
                    x.valorPrevisto(), x.valorRecebido(), x.dataCompetencia(), x.vencimento(), x.dataRecebimento(), x.status(), x.origem()});
            aba(wb, e, "Socorristas",
                new String[]{"Nome","QRA","Telefone","Documento","Viatura","Tem acesso","Ativo"},
                socorristas, x -> new Object[]{x.nome(), x.qra(), x.telefone(), x.documento(), x.veiculo(),
                    x.usuarioId() == null ? "Não" : "Sim", x.ativo() ? "Sim" : "Não"});
            aba(wb, e, "Veículos",
                new String[]{"Identificação","Placa","Modelo","Custo por km","Ativo"},
                veiculos, x -> new Object[]{x.identificacao(), x.placa(), x.modelo(), x.custoPorKm(), x.ativo() ? "Sim" : "Não"});
            aba(wb, e, "Quilometragem",
                new String[]{"Data","Veículo","Socorrista","Protocolo","Hodômetro inicial","Hodômetro final","Km total","Km remunerado","Km morto","Custo por km","Custo do km morto"},
                kms, x -> new Object[]{x.data(), x.veiculo(), x.motorista(), x.protocolo(), x.hodometroInicial(), x.hodometroFinal(),
                    x.quilometragemTotal(), x.quilometragemRemunerada(), x.kmMorto(), x.custoPorKm(), x.custoKmMorto()});
            aba(wb, e, "Calendário Porto",
                new String[]{"Data do pagamento","Competência inicial","Competência final","Descrição","Ativo"},
                ciclos, x -> new Object[]{x.dataPagamento(), x.competenciaInicio(), x.competenciaFim(), x.descricao(), x.ativo() ? "Sim" : "Não"});
            aba(wb, e, "Despesas fixas",
                new String[]{"Descrição","Categoria","Valor","Dia do vencimento","Veículo","Socorrista","Ativa"},
                fixas, x -> new Object[]{x.descricao(), x.categoria(), x.valor(), x.diaVencimento(), x.veiculo(), x.motorista(), x.ativo() ? "Sim" : "Não"});
            wb.write(out);
            return out.toByteArray();
        } catch (Exception ex) {
            throw new IllegalStateException("Não foi possível gerar a cópia dos dados.", ex);
        }
    }

    private record Contagem(String nome, int registros) {}

    /** Primeira aba: quando o arquivo foi gerado e quantas linhas cada aba deveria ter. */
    private void resumo(XSSFWorkbook wb, Estilos e, List<Contagem> contagens) {
        Sheet s = wb.createSheet("Cópia dos dados");
        Row titulo = s.createRow(0); celula(titulo.createCell(0), "Cópia dos dados do sistema", e.titulo);
        s.addMergedRegion(new CellRangeAddress(0, 0, 0, 1));
        Row quando = s.createRow(1); celula(quando.createCell(0), "Gerada em", e.texto);
        celula(quando.createCell(1), OffsetDateTime.now(), e.dataHora);
        Row cabecalho = s.createRow(3);
        celula(cabecalho.createCell(0), "Aba", e.cabecalho); celula(cabecalho.createCell(1), "Registros", e.cabecalho);
        int linha = 4;
        for (Contagem c : contagens) {
            Row r = s.createRow(linha++);
            celula(r.createCell(0), c.nome(), e.texto); celula(r.createCell(1), c.registros(), e.inteiro);
        }
        s.setColumnWidth(0, 30 * 256); s.setColumnWidth(1, 16 * 256);
    }

    private <T> void aba(XSSFWorkbook wb, Estilos e, String nome, String[] colunas, List<T> itens, Function<T, Object[]> linha) {
        Sheet s = wb.createSheet(nome);
        Row cabecalho = s.createRow(0);
        for (int i = 0; i < colunas.length; i++) celula(cabecalho.createCell(i), colunas[i], e.cabecalho);
        s.createFreezePane(0, 1);
        int n = 1;
        for (T item : itens) {
            Row r = s.createRow(n++);
            Object[] valores = linha.apply(item);
            for (int i = 0; i < valores.length; i++) celula(r.createCell(i), valores[i], estiloDe(valores[i], e));
        }
        if (n > 1) s.setAutoFilter(new CellRangeAddress(0, n - 1, 0, colunas.length - 1));
        for (int i = 0; i < colunas.length; i++) { s.autoSizeColumn(i); s.setColumnWidth(i, Math.min(s.getColumnWidth(i) + 512, 50 * 256)); }
    }

    private CellStyle estiloDe(Object valor, Estilos e) {
        if (valor instanceof BigDecimal) return e.moeda;
        if (valor instanceof Integer || valor instanceof Long) return e.inteiro;
        if (valor instanceof LocalDate) return e.data;
        if (valor instanceof OffsetDateTime) return e.dataHora;
        return e.texto;
    }

    /** Texto que comeca com = ou + vira formula no Excel: o prefixo protege a leitura do arquivo. */
    private void celula(Cell c, Object valor, CellStyle estilo) {
        c.setCellStyle(estilo);
        if (valor == null) return;
        switch (valor) {
            case BigDecimal numero -> c.setCellValue(numero.doubleValue());
            case Integer numero -> c.setCellValue(numero);
            case Long numero -> c.setCellValue(numero);
            case LocalDate dia -> c.setCellValue(Date.from(dia.atStartOfDay(ZoneId.systemDefault()).toInstant()));
            case OffsetDateTime momento -> c.setCellValue(Date.from(momento.toInstant()));
            default -> {
                String texto = String.valueOf(valor).strip();
                c.setCellValue(!texto.isEmpty() && "=+-@".indexOf(texto.charAt(0)) >= 0 ? "'" + texto : texto);
            }
        }
    }

    private static final class Estilos {
        final CellStyle titulo, cabecalho, texto, moeda, data, dataHora, inteiro;
        Estilos(Workbook wb) {
            DataFormat f = wb.createDataFormat();
            titulo = estilo(wb, true, (short) 15, IndexedColors.DARK_BLUE);
            cabecalho = estilo(wb, true, (short) 10, IndexedColors.WHITE);
            cabecalho.setFillForegroundColor(IndexedColors.DARK_BLUE.getIndex());
            cabecalho.setFillPattern(FillPatternType.SOLID_FOREGROUND);
            texto = estilo(wb, false, (short) 10, IndexedColors.BLACK);
            moeda = estilo(wb, false, (short) 10, IndexedColors.BLACK); moeda.setDataFormat(f.getFormat("R$ #,##0.00"));
            data = estilo(wb, false, (short) 10, IndexedColors.BLACK); data.setDataFormat(f.getFormat("dd/mm/yyyy"));
            dataHora = estilo(wb, false, (short) 10, IndexedColors.BLACK); dataHora.setDataFormat(f.getFormat("dd/mm/yyyy hh:mm"));
            inteiro = estilo(wb, false, (short) 10, IndexedColors.BLACK); inteiro.setDataFormat(f.getFormat("0"));
        }
        private static CellStyle estilo(Workbook wb, boolean negrito, short tamanho, IndexedColors cor) {
            CellStyle s = wb.createCellStyle(); Font fonte = wb.createFont();
            fonte.setBold(negrito); fonte.setFontHeightInPoints(tamanho); fonte.setColor(cor.getIndex());
            s.setFont(fonte); s.setVerticalAlignment(VerticalAlignment.CENTER); return s;
        }
    }
}
