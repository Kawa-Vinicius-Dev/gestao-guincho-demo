package com.anaiv.fluxogestao.service;

import com.anaiv.fluxogestao.dto.PortoDtos.*;
import com.anaiv.fluxogestao.entity.EnumsFinanceiros.StatusOperacionalPorto;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class PortoRelatorioService {
    private static final String EMPRESA="ANAIV - Gestão de Guincho";
    private final PortoService porto;

    public PortoRelatorioService(PortoService porto){this.porto=porto;}

    @Transactional(readOnly=true)
    public byte[] excel(PortoFiltros filtrosOp,PortoOsFiltros filtrosOs){
        List<OrdemPagamentoResponse> ops=porto.listarOps(filtrosOp);List<OrdemServicoResponse> oss=porto.listarOss(filtrosOs);
        ResumoOrdensPagamentoResponse resumo=porto.resumo(filtrosOp);Set<Long> idsOs=oss.stream().map(OrdemServicoResponse::id).collect(Collectors.toSet());
        List<PendenciaResponse> pendencias=porto.listarPendencias().stream().filter(x->x.id()!=null&&idsOs.contains(x.referenciaId())).toList();
        try(XSSFWorkbook wb=new XSSFWorkbook();ByteArrayOutputStream out=new ByteArrayOutputStream()){
            Estilos e=new Estilos(wb);criarResumo(wb,e,resumo,periodo(filtrosOp));criarServicos(wb,e,oss,ops);criarOps(wb,e,ops);
            criarPendencias(wb,e,pendencias);criarDevolvidos(wb,e,oss);criarAgrupado(wb,e,"Por Socorrista",oss,OrdemServicoResponse::socorrista);
            criarAgrupado(wb,e,"Por Especialidade",oss,OrdemServicoResponse::especialidade);wb.write(out);return out.toByteArray();
        }catch(Exception ex){throw new IllegalStateException("Não foi possível gerar o relatório Excel Porto.",ex);}
    }

    @Transactional(readOnly=true)
    public byte[] pdf(PortoFiltros filtrosOp,PortoOsFiltros filtrosOs){
        List<OrdemServicoResponse> oss=porto.listarOss(filtrosOs);ResumoOrdensPagamentoResponse resumo=porto.resumo(filtrosOp);
        List<ResumoGrupoResponse> especialidades=agrupar(oss,OrdemServicoResponse::especialidade);List<ResumoGrupoResponse> socorristas=agrupar(oss,OrdemServicoResponse::socorrista);
        try(PDDocument doc=new PDDocument();ByteArrayOutputStream out=new ByteArrayOutputStream()){
            PaginaPdf pagina=new PaginaPdf(doc);pagina.titulo(EMPRESA);pagina.subtitulo("Relatório gerencial Porto - "+periodo(filtrosOp));
            pagina.linha("Quantidade de OPs: "+resumo.quantidadeTotalOps());pagina.linha("Quantidade de OS: "+oss.size());
            pagina.linha("Valor total realizado: "+moeda(somarServicos(oss)));pagina.linha("Valor total previsto: "+moeda(resumo.valorTotalPrevisto()));
            pagina.linha("Valor médio por OP: "+moeda(resumo.valorMedioPorOp()));pagina.linha("Valor recebido: "+moeda(resumo.valorRecebido()));
            pagina.linha("OPs conciliadas: "+resumo.quantidadeConciliadas());pagina.linha("OPs com divergência: "+resumo.quantidadeComDivergencia()+" ("+moeda(resumo.valorTotalDivergencias())+")");
            pagina.linha("OPs aguardando recebimento: "+resumo.quantidadeAguardandoRecebimento());pagina.linha("OPs vencidas: "+resumo.quantidadeVencidasNaoRecebidas());
            pagina.linha("Serviços pendentes: "+oss.stream().filter(x->x.statusOperacional()==StatusOperacionalPorto.PENDENTE_PORTO).count());
            pagina.linha("Serviços devolvidos: "+oss.stream().filter(x->x.statusOperacional()==StatusOperacionalPorto.DEVOLVIDO_FINALIZADO).count());
            pagina.secao("Resumo por especialidade");for(ResumoGrupoResponse g:especialidades)pagina.linha(g.chave()+" - "+g.quantidade()+" - "+moeda(g.valor()));
            pagina.secao("Resumo por socorrista");for(ResumoGrupoResponse g:socorristas)pagina.linha(g.chave()+" - "+g.quantidade()+" - "+moeda(g.valor()));
            pagina.fechar();doc.save(out);return out.toByteArray();
        }catch(Exception ex){throw new IllegalStateException("Não foi possível gerar o relatório PDF Porto.",ex);}
    }

    @Transactional(readOnly=true) public byte[] excelOp(Long id){OrdemPagamentoDetalheResponse detalhe=porto.detalhar(id);OrdemPagamentoResponse op=detalhe.ordemPagamento();List<OrdemServicoResponse> servicos=detalhe.ordensServico();
        try(XSSFWorkbook wb=new XSSFWorkbook();ByteArrayOutputStream out=new ByteArrayOutputStream()){Estilos e=new Estilos(wb);Sheet resumo=wb.createSheet("Resumo da OP");titulo(resumo,e,"Ordem de Pagamento "+op.numero(),"Conciliação Porto");Object[][] dados={{"Valor informado",op.valorTotal()},{"Valor calculado",op.valorOrdensServico()},{"Diferença",op.divergencia()},{"Quantidade de OS",op.quantidadeOrdensServico()},{"Situação",op.situacao()},{"Conciliação",nome(op.statusConciliacao())}};int linha=3;for(Object[] item:dados){Row r=resumo.createRow(linha++);texto(r.createCell(0),String.valueOf(item[0]),e.texto);if(item[1] instanceof BigDecimal b)numero(r.createCell(1),b,e.moeda);else texto(r.createCell(1),String.valueOf(item[1]),e.texto);}resumo.autoSizeColumn(0);resumo.autoSizeColumn(1);
            criarListaOp(wb,e,"Serviços vinculados",servicos);criarListaOp(wb,e,"Serviços regulares",servicos.stream().filter(x->x.statusOperacional()!=StatusOperacionalPorto.LIBERADO_APOS_ANALISE).toList());criarListaOp(wb,e,"Liberados após análise",servicos.stream().filter(x->x.statusOperacional()==StatusOperacionalPorto.LIBERADO_APOS_ANALISE).toList());criarListaOp(wb,e,"Divergências",op.divergencia()!=null&&op.divergencia().abs().compareTo(new BigDecimal("0.01"))>0?servicos:List.of());criarAgrupado(wb,e,"Por socorrista",servicos,OrdemServicoResponse::socorrista);criarAgrupado(wb,e,"Por especialidade",servicos,OrdemServicoResponse::especialidade);wb.write(out);return out.toByteArray();
        }catch(Exception ex){throw new IllegalStateException("Não foi possível gerar o Excel da OP Porto.",ex);}}

    @Transactional(readOnly=true) public byte[] pdfOp(Long id){OrdemPagamentoDetalheResponse detalhe=porto.detalhar(id);OrdemPagamentoResponse op=detalhe.ordemPagamento();try(PDDocument doc=new PDDocument();ByteArrayOutputStream out=new ByteArrayOutputStream()){PaginaPdf pagina=new PaginaPdf(doc);pagina.titulo(EMPRESA);pagina.subtitulo("Ordem de Pagamento "+op.numero());pagina.linha("Valor informado: "+moeda(op.valorTotal()));pagina.linha("Valor calculado: "+moeda(op.valorOrdensServico()));pagina.linha("Diferenca: "+moeda(op.divergencia()));pagina.linha("Quantidade de OS: "+op.quantidadeOrdensServico());pagina.linha("Situacao financeira: "+op.situacao());pagina.linha("Conciliacao: "+nome(op.statusConciliacao()));pagina.secao("Servicos vinculados");for(OrdemServicoResponse os:detalhe.ordensServico())pagina.linha(os.numero()+" | "+nome(os.statusOperacional())+" | "+moeda(os.valorTotal()));pagina.fechar();doc.save(out);return out.toByteArray();}catch(Exception ex){throw new IllegalStateException("Não foi possível gerar o PDF da OP Porto.",ex);}}

    private void criarResumo(XSSFWorkbook wb,Estilos e,ResumoOrdensPagamentoResponse r,String periodo){Sheet s=wb.createSheet("Resumo");titulo(s,e,"Resumo gerencial Porto",periodo);
        Object[][] dados={{"Quantidade total de OPs",r.quantidadeTotalOps()},{"Valor total previsto",r.valorTotalPrevisto()},{"OPs conciliadas",r.quantidadeConciliadas()},{"Valor conciliado",r.valorConciliadas()},
            {"OPs com divergência",r.quantidadeComDivergencia()},{"Valor das divergências",r.valorTotalDivergencias()},{"OPs recebidas",r.quantidadeRecebidas()},{"Valor recebido",r.valorRecebido()},
            {"OPs aguardando recebimento",r.quantidadeAguardandoRecebimento()},{"Valor aguardando",r.valorAguardandoRecebimento()},{"OPs vencidas",r.quantidadeVencidasNaoRecebidas()},
            {"Valor vencido",r.valorVencidoNaoRecebido()},{"Valor médio por OP",r.valorMedioPorOp()},{"Quantidade de OS",r.quantidadeOrdensServico()}};
        int linha=3;for(Object[] d:dados){Row row=s.createRow(linha++);texto(row.createCell(0),String.valueOf(d[0]),e.texto);if(d[1] instanceof BigDecimal b)numero(row.createCell(1),b,e.moeda);else numero(row.createCell(1),new BigDecimal(String.valueOf(d[1])),e.inteiro);}s.setColumnWidth(0,36*256);s.setColumnWidth(1,20*256);}

    private void criarServicos(XSSFWorkbook wb,Estilos e,List<OrdemServicoResponse> oss,List<OrdemPagamentoResponse> ops){Sheet s=wb.createSheet("Todos os Serviços");String[] h={"Número da OS","Data do atendimento","Especialidade","Socorrista","QRA","Viatura","Valor","Status operacional","Status financeiro","Número da OP","Data programada","Data recebida"};cabecalho(s,e,h);Map<Long,OrdemPagamentoResponse> mapa=ops.stream().collect(Collectors.toMap(OrdemPagamentoResponse::id,Function.identity()));int n=1;
        for(OrdemServicoResponse os:oss){Row r=s.createRow(n++);texto(r.createCell(0),os.numero(),e.texto);data(r.createCell(1),os.dataAtendimento(),e.data);texto(r.createCell(2),os.especialidade(),e.texto);texto(r.createCell(3),os.socorrista(),e.texto);texto(r.createCell(4),os.qra(),e.texto);texto(r.createCell(5),os.viatura(),e.texto);numero(r.createCell(6),os.valorTotal(),e.moeda);texto(r.createCell(7),nome(os.statusOperacional()),e.texto);texto(r.createCell(8),nome(os.statusFinanceiro()),e.texto);texto(r.createCell(9),os.ordemPagamento(),e.texto);OrdemPagamentoResponse op=mapa.get(os.ordemPagamentoId());data(r.createCell(10),op==null?null:op.dataPagamentoProgramada(),e.data);data(r.createCell(11),op==null?null:op.dataRecebimento(),e.data);}
        total(s,e,n,6,"Total");finalizarTabela(s,h.length,n);}

    private void criarOps(XSSFWorkbook wb,Estilos e,List<OrdemPagamentoResponse> ops){Sheet s=wb.createSheet("Previsões e OPs");String[] h={"Número da OP","Data programada","Quantidade de OS","Valor previsto","Soma das OS","Diferença","Conciliação","Situação do recebimento","Valor recebido","Data recebida"};cabecalho(s,e,h);int n=1;for(OrdemPagamentoResponse op:ops){Row r=s.createRow(n++);texto(r.createCell(0),op.numero(),e.texto);data(r.createCell(1),op.dataPagamentoProgramada(),e.data);numero(r.createCell(2),BigDecimal.valueOf(op.quantidadeOrdensServico()),e.inteiro);numero(r.createCell(3),op.valorTotal(),e.moeda);numero(r.createCell(4),op.valorOrdensServico(),e.moeda);numero(r.createCell(5),op.divergencia(),e.moeda);texto(r.createCell(6),nome(op.statusConciliacao()),e.texto);texto(r.createCell(7),op.situacao(),e.texto);numero(r.createCell(8),op.valorRecebido(),e.moeda);data(r.createCell(9),op.dataRecebimento(),e.data);}total(s,e,n,3,"Total previsto");finalizarTabela(s,h.length,n);}

    private void criarPendencias(XSSFWorkbook wb,Estilos e,List<PendenciaResponse> itens){Sheet s=wb.createSheet("Serviços Pendentes");String[] h={"Número da OS","Motivo","Valor","Data","Observação","Responsável","Situação","Prazo","Referência Porto"};cabecalho(s,e,h);int n=1;for(PendenciaResponse p:itens){Row r=s.createRow(n++);texto(r.createCell(0),p.referencia(),e.texto);texto(r.createCell(1),p.motivo(),e.texto);numero(r.createCell(2),p.valor(),e.moeda);data(r.createCell(3),p.data(),e.data);texto(r.createCell(4),p.observacao(),e.texto);texto(r.createCell(5),p.responsavel(),e.texto);texto(r.createCell(6),p.situacao(),e.texto);data(r.createCell(7),p.prazo(),e.data);texto(r.createCell(8),p.referenciaPorto(),e.texto);}finalizarTabela(s,h.length,n);}
    private void criarDevolvidos(XSSFWorkbook wb,Estilos e,List<OrdemServicoResponse> oss){Sheet s=wb.createSheet("Serviços Devolvidos");String[] h={"Número da OS","Especialidade","Data do atendimento","Data da devolução","Data da finalização","Valor"};cabecalho(s,e,h);int n=1;for(OrdemServicoResponse os:oss.stream().filter(x->x.statusOperacional()==StatusOperacionalPorto.DEVOLVIDO_FINALIZADO).toList()){Row r=s.createRow(n++);texto(r.createCell(0),os.numero(),e.texto);texto(r.createCell(1),os.especialidade(),e.texto);data(r.createCell(2),os.dataAtendimento(),e.data);data(r.createCell(3),os.dataDevolucao(),e.data);data(r.createCell(4),os.dataFinalizacaoDevolucao(),e.data);numero(r.createCell(5),os.valorTotal(),e.moeda);}finalizarTabela(s,h.length,n);}
    private void criarAgrupado(XSSFWorkbook wb,Estilos e,String nome,List<OrdemServicoResponse> oss,Function<OrdemServicoResponse,String> campo){Sheet s=wb.createSheet(nome);String[] h={nome.substring(4),"Quantidade","Valor"};cabecalho(s,e,h);int n=1;for(ResumoGrupoResponse g:agrupar(oss,campo)){Row r=s.createRow(n++);texto(r.createCell(0),g.chave(),e.texto);numero(r.createCell(1),BigDecimal.valueOf(g.quantidade()),e.inteiro);numero(r.createCell(2),g.valor(),e.moeda);}finalizarTabela(s,h.length,n);}
    private void criarListaOp(XSSFWorkbook wb,Estilos e,String nome,List<OrdemServicoResponse> itens){Sheet s=wb.createSheet(nome);String[] h={"Número da OS","Atendimento","Especialidade","Socorrista","QRA","Viatura","Valor","Status operacional","Previsão original","Ciclo efetivo","Ciclos de atraso"};cabecalho(s,e,h);int n=1;for(OrdemServicoResponse os:itens){Row r=s.createRow(n++);texto(r.createCell(0),os.numero(),e.texto);data(r.createCell(1),os.dataAtendimento(),e.data);texto(r.createCell(2),os.especialidade(),e.texto);texto(r.createCell(3),os.socorrista(),e.texto);texto(r.createCell(4),os.qra(),e.texto);texto(r.createCell(5),os.viatura(),e.texto);numero(r.createCell(6),os.valorTotal(),e.moeda);texto(r.createCell(7),nome(os.statusOperacional()),e.texto);data(r.createCell(8),os.dataPrevistaOriginal(),e.data);data(r.createCell(9),os.dataEfetivaPagamento(),e.data);numero(r.createCell(10),BigDecimal.valueOf(os.ciclosAtraso()),e.inteiro);}finalizarTabela(s,h.length,n);}

    private List<ResumoGrupoResponse> agrupar(List<OrdemServicoResponse> itens,Function<OrdemServicoResponse,String> campo){return itens.stream().collect(Collectors.groupingBy(x->{String v=campo.apply(x);return v==null||v.isBlank()?"Não informado":v;},TreeMap::new,Collectors.toList())).entrySet().stream().map(x->new ResumoGrupoResponse(x.getKey(),x.getValue().size(),somarServicos(x.getValue()))).toList();}
    private BigDecimal somarServicos(Collection<OrdemServicoResponse> itens){return itens.stream().map(OrdemServicoResponse::valorTotal).filter(Objects::nonNull).reduce(BigDecimal.ZERO,BigDecimal::add);}
    private void titulo(Sheet s,Estilos e,String titulo,String periodo){Row a=s.createRow(0);texto(a.createCell(0),titulo,e.titulo);Row b=s.createRow(1);texto(b.createCell(0),EMPRESA+" | "+periodo,e.subtitulo);s.addMergedRegion(new CellRangeAddress(0,0,0,1));s.addMergedRegion(new CellRangeAddress(1,1,0,1));}
    private void cabecalho(Sheet s,Estilos e,String[] colunas){Row r=s.createRow(0);for(int i=0;i<colunas.length;i++)texto(r.createCell(i),colunas[i],e.cabecalho);s.createFreezePane(0,1);}
    private void finalizarTabela(Sheet s,int colunas,int ultimaLinha){if(ultimaLinha>1)s.setAutoFilter(new CellRangeAddress(0,ultimaLinha-1,0,colunas-1));for(int i=0;i<colunas;i++){s.autoSizeColumn(i);s.setColumnWidth(i,Math.min(s.getColumnWidth(i)+512,50*256));}}
    private void total(Sheet s,Estilos e,int linha,int coluna,String rotulo){Row r=s.createRow(linha);texto(r.createCell(Math.max(0,coluna-1)),rotulo,e.cabecalho);Cell c=r.createCell(coluna);c.setCellFormula("SUM("+org.apache.poi.ss.util.CellReference.convertNumToColString(coluna)+"2:"+org.apache.poi.ss.util.CellReference.convertNumToColString(coluna)+linha+")");c.setCellStyle(e.moeda);}
    private void texto(Cell c,String valor,CellStyle estilo){if(valor!=null){String seguro=valor.strip();if(!seguro.isEmpty()&&"=+-@".indexOf(seguro.charAt(0))>=0)seguro="'"+seguro;c.setCellValue(seguro);}c.setCellStyle(estilo);}
    private void numero(Cell c,BigDecimal valor,CellStyle estilo){if(valor!=null)c.setCellValue(valor.doubleValue());c.setCellStyle(estilo);}
    private void data(Cell c,LocalDate valor,CellStyle estilo){if(valor!=null)c.setCellValue(Date.from(valor.atStartOfDay(ZoneId.systemDefault()).toInstant()));c.setCellStyle(estilo);}
    private String nome(Object valor){return valor==null?null:String.valueOf(valor).replace('_',' ');}
    private String periodo(PortoFiltros f){if(f!=null&&(f.dataInicio()!=null||f.dataFim()!=null))return (f.dataInicio()==null?"início":f.dataInicio())+" a "+(f.dataFim()==null?"hoje":f.dataFim());return "Todo o período";}
    private String moeda(BigDecimal valor){return "R$ "+String.format(Locale.forLanguageTag("pt-BR"),"%,.2f",valor==null?BigDecimal.ZERO:valor);}

    private static final class Estilos {final CellStyle titulo,subtitulo,cabecalho,texto,moeda,data,inteiro;Estilos(Workbook wb){DataFormat f=wb.createDataFormat();titulo=estilo(wb,true,(short)15,IndexedColors.DARK_BLUE);subtitulo=estilo(wb,false,(short)10,IndexedColors.GREY_80_PERCENT);cabecalho=estilo(wb,true,(short)10,IndexedColors.WHITE);cabecalho.setFillForegroundColor(IndexedColors.DARK_BLUE.getIndex());cabecalho.setFillPattern(FillPatternType.SOLID_FOREGROUND);texto=estilo(wb,false,(short)10,IndexedColors.BLACK);moeda=estilo(wb,false,(short)10,IndexedColors.BLACK);moeda.setDataFormat(f.getFormat("R$ #,##0.00"));data=estilo(wb,false,(short)10,IndexedColors.BLACK);data.setDataFormat(f.getFormat("dd/mm/yyyy"));inteiro=estilo(wb,false,(short)10,IndexedColors.BLACK);inteiro.setDataFormat(f.getFormat("0"));}private static CellStyle estilo(Workbook wb,boolean negrito,short tamanho,IndexedColors cor){CellStyle s=wb.createCellStyle();Font font=wb.createFont();font.setBold(negrito);font.setFontHeightInPoints(tamanho);font.setColor(cor.getIndex());s.setFont(font);s.setVerticalAlignment(VerticalAlignment.CENTER);return s;}}

    private static final class PaginaPdf {private final PDDocument doc;private PDPageContentStream out;private float y;private final PDType1Font normal=new PDType1Font(Standard14Fonts.FontName.HELVETICA);private final PDType1Font bold=new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD);PaginaPdf(PDDocument d)throws Exception{doc=d;novaPagina();}void novaPagina()throws Exception{if(out!=null)out.close();PDPage p=new PDPage(PDRectangle.A4);doc.addPage(p);out=new PDPageContentStream(doc,p);y=800;}void titulo(String t)throws Exception{escrever(t,bold,16,18);}void subtitulo(String t)throws Exception{escrever(t,normal,10,22);}void secao(String t)throws Exception{if(y<100)novaPagina();y-=8;escrever(t,bold,12,18);}void linha(String t)throws Exception{if(y<55)novaPagina();escrever(t,normal,9,14);}void escrever(String t,PDType1Font fonte,float tamanho,float passo)throws Exception{out.beginText();out.setFont(fonte,tamanho);out.newLineAtOffset(45,y);out.showText(t==null?"":t);out.endText();y-=passo;}void fechar()throws Exception{if(out!=null){out.close();out=null;}}}
}
