package com.anaiv.fluxogestao.porto;

import com.jayway.jsonpath.JsonPath;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PortoRelatorioApiIntegrationTest {
    @Autowired MockMvc mvc;

    @Test
    void excelMantemUmaLinhaPorOpAbasEsperadasFiltrosETextoSeguro() throws Exception {
        String token=prepararDados();
        byte[] bytes=mvc.perform(get("/api/porto/relatorios/excel").param("numero","OP-EXP-001").param("numeroOp","OP-EXP-001")
                .header("Authorization","Bearer "+token))
            .andExpect(status().isOk())
            .andExpect(header().string("Content-Type","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
            .andReturn().getResponse().getContentAsByteArray();

        try(XSSFWorkbook workbook=new XSSFWorkbook(new ByteArrayInputStream(bytes))){
            assertThat(java.util.stream.IntStream.range(0,workbook.getNumberOfSheets()).mapToObj(i->workbook.getSheetAt(i).getSheetName()).toList()).containsExactly(
                "Resumo","Todos os Serviços","Previsões e OPs","Serviços Pendentes","Serviços Devolvidos","Por Socorrista","Por Especialidade");
            assertThat(workbook.getSheet("Previsões e OPs").getLastRowNum()).isEqualTo(2);
            assertThat(java.util.stream.IntStream.rangeClosed(1,workbook.getSheet("Previsões e OPs").getLastRowNum())
                .mapToObj(i->workbook.getSheet("Previsões e OPs").getRow(i).getCell(0)).filter(Objects::nonNull)
                .filter(c->c.getCellType()==CellType.STRING&&c.getStringCellValue().equals("OP-EXP-001")).count()).isEqualTo(1);
            assertThat(workbook.getSheet("Todos os Serviços").getLastRowNum()).isEqualTo(3);
            var cabecalho=workbook.getSheet("Todos os Serviços").getRow(0);
            assertThat(java.util.stream.IntStream.range(0,cabecalho.getLastCellNum()).mapToObj(i->cabecalho.getCell(i).getStringCellValue()).toList()).contains("Número da OS","Número da OP","Data recebida");
            assertThat(workbook.getSheet("Todos os Serviços").getRow(1).getCell(2).getCellType()).isEqualTo(CellType.STRING);
            assertThat(workbook.getSheet("Todos os Serviços").getRow(1).getCell(2).getStringCellValue()).startsWith("'");
        }
    }

    @Test
    void pdfMostraQuantidadeCorretaDeOpsEOsDoFiltro() throws Exception {
        String token=prepararDados();
        byte[] bytes=mvc.perform(get("/api/porto/relatorios/pdf").param("numero","OP-EXP-001").param("numeroOp","OP-EXP-001")
                .header("Authorization","Bearer "+token))
            .andExpect(status().isOk()).andExpect(header().string("Content-Type","application/pdf"))
            .andReturn().getResponse().getContentAsByteArray();
        try(var documento=Loader.loadPDF(bytes)){
            String texto=new PDFTextStripper().getText(documento);
            assertThat(texto).contains("ANAIV","Quantidade de OPs: 1","Quantidade de OS: 2","Valor médio por OP");
        }
    }

    private String prepararDados() throws Exception {
        String token=login();
        confirmar(token,previa(token,"op-exportacao.csv","""
            Número da Ordem de Pagamento;Valor Total do Serviço;Nome: Código;Data de Pagamento
            OP-EXP-001;300,00;Sintético: Exportação;31/12/2099
            """),"{}");
        long opId=idOp(token,"OP-EXP-001");
        confirmar(token,previa(token,"os-exportacao.csv","""
            Número da Ordem de Serviço,Valor Total,Especialidade,Sigla da Viatura,Socorrista,QRA,Data de atendimento
            OS-EXP-001,100.00,=2+2,,SOCORRISTA TESTE,QRA-TESTE-001,2026-08-01
            OS-EXP-002,200.00,PANE,VTR-TESTE,SOCORRISTA TESTE,QRA-TESTE-002,2026-08-01
            """),"{\"ordemPagamentoId\":"+opId+"}");
        return token;
    }

    private long idOp(String token,String numero) throws Exception {
        String corpo=mvc.perform(get("/api/porto/ordens-pagamento").param("numero",numero).header("Authorization","Bearer "+token))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        List<Map<String,Object>> itens=JsonPath.read(corpo,"$");return ((Number)itens.getFirst().get("id")).longValue();
    }
    private long previa(String token,String nome,String csv) throws Exception {MockMultipartFile arquivo=new MockMultipartFile("arquivo",nome,"text/csv",csv.getBytes(StandardCharsets.UTF_8));String corpo=mvc.perform(multipart("/api/porto/importacoes/previa").file(arquivo).header("Authorization","Bearer "+token)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();return ((Number)JsonPath.read(corpo,"$.id")).longValue();}
    private void confirmar(String token,long id,String corpo)throws Exception{mvc.perform(post("/api/porto/importacoes/{id}/confirmar",id).header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON).content(corpo)).andExpect(status().isOk());}
    private String login()throws Exception{String corpo=mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"admin@fluxogestao.local\",\"senha\":\"Admin@123\"}")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();return JsonPath.read(corpo,"$.token");}
}
