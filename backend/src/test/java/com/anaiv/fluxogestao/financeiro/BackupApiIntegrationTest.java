package com.anaiv.fluxogestao.financeiro;

import com.jayway.jsonpath.JsonPath;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * O banco esta num plano sem backup automatico. Esta copia e o que sobra na mao do dono se o
 * Supabase sumir, entao ela precisa conter os dados de verdade - nao so as abas certas.
 */
@SpringBootTest
@AutoConfigureMockMvc @ActiveProfiles("test")
class BackupApiIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    @AfterEach void limpar(){
        jdbc.update("delete from receitas where ordem_servico_porto_id in (select id from ordens_servico_porto where numero like 'OS-COPIA-%')");
        jdbc.update("delete from contas_receber where ordem_servico_porto_id in (select id from ordens_servico_porto where numero like 'OS-COPIA-%')");
        jdbc.update("delete from registros_importados_porto where importacao_id in (select id from importacoes where nome_arquivo='copia.csv')");
        jdbc.update("delete from ordens_servico_porto where numero like 'OS-COPIA-%'");
        // a confirmacao grava historico e ele aponta para a OP: sai antes
        jdbc.update("delete from historico_porto where ordem_pagamento_id in (select id from ordens_pagamento_porto where numero='OP-COPIA')");
        jdbc.update("delete from justificativas_conciliacao_porto where ordem_pagamento_id in (select id from ordens_pagamento_porto where numero='OP-COPIA')");
        jdbc.update("delete from ordens_pagamento_porto where numero='OP-COPIA'");
        jdbc.update("delete from importacoes where nome_arquivo='copia.csv'");
        jdbc.update("delete from motoristas where qra='QRA-COPIA'");
    }

    @Test void aCopiaLevaOsDadosDeVerdadeEDizQuantosSaoDeCadaAba() throws Exception {
        String token=login();
        criar(token,"/api/motoristas","{\"nome\":\"Socorrista da Cópia\",\"qra\":\"QRA-COPIA\"}");
        long calendario=((Number)JsonPath.read(criar(token,"/api/porto/calendario",
            "{\"dataPagamento\":\"2087-08-14\",\"competenciaInicio\":\"2087-07-01\",\"competenciaFim\":\"2087-07-15\",\"descricao\":\"Ciclo da cópia\",\"ativo\":true}"),"$.id")).longValue();
        MockMultipartFile arquivo=new MockMultipartFile("arquivo","copia.csv","text/csv",("""
            Número da Ordem de Serviço,Valor Total,Especialidade,Sigla da Viatura,Socorrista,QRA,Data de atendimento
            OS-COPIA-001,321.50,GUINCHO,,SOCORRISTA DA CÓPIA,QRA-COPIA,05/07/2087
            """).getBytes(StandardCharsets.UTF_8));
        long previa=((Number)JsonPath.read(mvc.perform(multipart("/api/porto/importacoes/previa").file(arquivo)
            .header("Authorization","Bearer "+token)).andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString(),"$.id")).longValue();
        mvc.perform(post("/api/porto/importacoes/{id}/confirmar",previa).header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"numeroOrdemPagamento\":\"OP-COPIA\",\"calendarioPagamentoId\":"+calendario+"}"))
            .andExpect(status().isOk());

        byte[] bytes=mvc.perform(get("/api/backup/excel").header("Authorization","Bearer "+token))
            .andExpect(status().isOk())
            .andExpect(header().string("Content-Type","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
            .andExpect(header().string("Content-Disposition",org.hamcrest.Matchers.containsString("copia-jms-")))
            .andReturn().getResponse().getContentAsByteArray();

        try(XSSFWorkbook wb=new XSSFWorkbook(new ByteArrayInputStream(bytes))){
            assertThat(IntStream.range(0,wb.getNumberOfSheets()).mapToObj(i->wb.getSheetAt(i).getSheetName()).toList())
                .containsExactly("Cópia dos dados","Ordens de pagamento","Ordens de serviço","Receitas","Despesas",
                    "Contas a receber","Socorristas","Veículos","Quilometragem","Calendário Porto","Despesas fixas");

            // a OS importada aparece com o valor que veio da Porto, e o socorrista vinculado
            Row os=procurar(wb.getSheet("Ordens de serviço"),"OS-COPIA-001");
            assertThat(os.getCell(1).getStringCellValue()).isEqualTo("OP-COPIA");
            assertThat(os.getCell(8).getNumericCellValue()).isEqualTo(321.50);
            assertThat(os.getCell(7).getStringCellValue()).isEqualTo("Socorrista da Cópia");
            assertThat(procurar(wb.getSheet("Ordens de pagamento"),"OP-COPIA")).isNotNull();
            assertThat(procurar(wb.getSheet("Socorristas"),"Socorrista da Cópia")).isNotNull();
            assertThat(procurar(wb.getSheet("Calendário Porto"),"Ciclo da cópia")).isNotNull();

            // o resumo conta o que cada aba deveria ter: e como se confere que a copia veio inteira
            Sheet resumo=wb.getSheet("Cópia dos dados");
            assertThat(resumo.getRow(1).getCell(0).getStringCellValue()).isEqualTo("Gerada em");
            int registrosDeOs=(int)linhaDoResumo(resumo,"Ordens de serviço");
            assertThat(registrosDeOs).isEqualTo(wb.getSheet("Ordens de serviço").getLastRowNum());
        }
    }

    @Test void copiaEExclusivaDoAdministrador() throws Exception {
        String admin=login();
        mvc.perform(post("/api/usuarios").header("Authorization","Bearer "+admin)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\"Sem Direito a Cópia\",\"email\":\"sem.copia@example.com\",\"senha\":\"SemCopia@123\",\"perfil\":\"FUNCIONARIO\"}"))
            .andExpect(status().isCreated());
        String socorrista=JsonPath.read(mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"sem.copia@example.com\",\"senha\":\"SemCopia@123\"}"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(),"$.token");

        mvc.perform(get("/api/backup/excel").header("Authorization","Bearer "+socorrista)).andExpect(status().isForbidden());
        mvc.perform(get("/api/backup/excel")).andExpect(status().isUnauthorized());
    }

    private Row procurar(Sheet aba,String valor){
        return IntStream.rangeClosed(1,aba.getLastRowNum()).mapToObj(aba::getRow).filter(java.util.Objects::nonNull)
            .filter(r->IntStream.range(0,r.getLastCellNum()).mapToObj(r::getCell).filter(java.util.Objects::nonNull)
                .anyMatch(c->c.getCellType()==CellType.STRING&&c.getStringCellValue().equals(valor)))
            .findFirst().orElseThrow(()->new AssertionError("não achei \""+valor+"\" na aba "+aba.getSheetName()));
    }
    private double linhaDoResumo(Sheet resumo,String nome){
        Row linha=procurar(resumo,nome);
        Cell registros=linha.getCell(1);
        return registros.getNumericCellValue();
    }
    private String criar(String token,String caminho,String corpo) throws Exception {
        return mvc.perform(post(caminho).header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON).content(corpo))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
    }
    private String login() throws Exception {
        String corpo=mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"admin@fluxogestao.local\",\"senha\":\"Admin@123\"}"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(corpo,"$.token");
    }
}
