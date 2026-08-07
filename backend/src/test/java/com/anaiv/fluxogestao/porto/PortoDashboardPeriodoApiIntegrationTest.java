package com.anaiv.fluxogestao.porto;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.nio.charset.StandardCharsets;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest @AutoConfigureMockMvc @ActiveProfiles("test")
class PortoDashboardPeriodoApiIntegrationTest {
    @Autowired MockMvc mvc;

    @Test void calculaSemanaEQuinzenaNasBordas() throws Exception {
        String token=login();
        mvc.perform(get("/api/porto/dashboard").param("periodo","SEMANAL").param("referencia","2026-08-05").header("Authorization","Bearer "+token))
            .andExpect(status().isOk()).andExpect(jsonPath("$.periodoInicio").value("2026-08-03")).andExpect(jsonPath("$.periodoFim").value("2026-08-09"));
        mvc.perform(get("/api/porto/dashboard").param("periodo","QUINZENAL").param("referencia","2026-08-20").header("Authorization","Bearer "+token))
            .andExpect(status().isOk()).andExpect(jsonPath("$.periodoInicio").value("2026-08-16")).andExpect(jsonPath("$.periodoFim").value("2026-08-31"));
    }

    @Test void recebimentoConfirmadoMantemDataFinanceiraDaImportacaoIdempotente() throws Exception {
        String token=login();
        String op=mvc.perform(post("/api/porto/ordens-pagamento").header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON).content("""
            {"numero":"OP-LINHAS-TEMPO","dataPrevista":"2042-08-15","valorInformado":321.00,"statusPorto":"PROCESSADO",
             "situacaoFinanceira":"PROGRAMADO","pagamentoConfirmado":false,"observacao":"Sintético"}
            """)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        long opId=((Number)JsonPath.read(op,"$.id")).longValue();

        String calendario=mvc.perform(post("/api/porto/calendario").header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON).content("""
            {"dataPagamento":"2042-08-15","competenciaInicio":"2042-08-01","competenciaFim":"2042-08-15","descricao":"Linha do tempo","ativo":true}
            """)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        long calendarioId=((Number)JsonPath.read(calendario,"$.id")).longValue();

        MockMultipartFile arquivo=new MockMultipartFile("arquivo","linha-tempo.csv","text/csv",("""
            Número da Ordem de Serviço,Valor Total,Especialidade,Sigla da Viatura,Socorrista,QRA,Data de atendimento
            OS-LINHAS-TEMPO,321.00,GUINCHO,VTR-01,SOCORRISTA TESTE,QRA-LINHA,2042-08-10
            """).getBytes(StandardCharsets.UTF_8));
        String previa=mvc.perform(multipart("/api/porto/importacoes/previa").file(arquivo).header("Authorization","Bearer "+token).param("ordemPagamentoId",String.valueOf(opId)))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        long previaId=((Number)JsonPath.read(previa,"$.id")).longValue();
        mvc.perform(post("/api/porto/importacoes/{id}/confirmar",previaId).header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON)
            .content("{\"ordemPagamentoId\":"+opId+",\"calendarioPagamentoId\":"+calendarioId+"}"))
            .andExpect(status().isOk());

        mvc.perform(patch("/api/porto/ordens-pagamento/{id}/receber",opId).header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON)
            .content("{\"valorRecebido\":321.00,\"dataRecebimento\":\"2042-09-01\"}"))
            .andExpect(status().isOk());
        mvc.perform(get("/api/porto/dashboard").param("periodo","PERSONALIZADO").param("dataInicio","2042-08-15").param("dataFim","2042-08-15").param("visao","PAGAMENTOS").header("Authorization","Bearer "+token))
            .andExpect(status().isOk()).andExpect(jsonPath("$.valorProgramado").value(321.0)).andExpect(jsonPath("$.valorRecebido").value(321.0));
    }

    private String login() throws Exception {
        String resposta=mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"admin@fluxogestao.local\",\"senha\":\"Admin@123\"}"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(resposta,"$.token");
    }
}
