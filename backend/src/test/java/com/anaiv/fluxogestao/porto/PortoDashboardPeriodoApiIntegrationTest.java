package com.anaiv.fluxogestao.porto;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

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

    @Test void recebidoUsaDataBancariaEProgramadoUsaDataDaOp() throws Exception {
        String token=login();
        mvc.perform(post("/api/porto/ordens-pagamento").header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON).content("""
            {"numero":"OP-LINHAS-TEMPO","dataPrevista":"2026-08-15","valorInformado":321.00,"statusPorto":"PROCESSADO",
             "situacaoFinanceira":"PROGRAMADO","pagamentoConfirmado":true,"dataRecebimento":"2026-09-01","observacao":"Sintético"}
            """)).andExpect(status().isCreated());
        mvc.perform(get("/api/porto/dashboard").param("periodo","PERSONALIZADO").param("dataInicio","2026-09-01").param("dataFim","2026-09-01").param("visao","PAGAMENTOS").header("Authorization","Bearer "+token))
            .andExpect(status().isOk()).andExpect(jsonPath("$.valorProgramado").value(0)).andExpect(jsonPath("$.valorRecebido").value(321.0));
    }

    private String login() throws Exception {String resposta=mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"admin@fluxogestao.local\",\"senha\":\"Admin@123\"}")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();return JsonPath.read(resposta,"$.token");}
}
