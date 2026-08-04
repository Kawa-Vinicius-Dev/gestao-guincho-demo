package com.anaiv.fluxogestao.porto;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PortoOrdemPagamentoManualApiIntegrationTest {
    @Autowired MockMvc mvc;

    @Test
    void criaOpProcessadaSemInferirRecebimento() throws Exception {
        String token=login();
        String resposta=mvc.perform(post("/api/porto/ordens-pagamento").header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON).content("""
                    {"numero":"OP-MANUAL-001","dataPrevista":"2026-08-28","valorInformado":1200.50,
                     "statusPorto":"PROCESSADO","situacaoFinanceira":"A_CONFIRMAR",
                     "pagamentoConfirmado":false,"observacao":"Registro sintético"}
                    """))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.numero").value("OP-MANUAL-001"))
            .andExpect(jsonPath("$.statusPorto").value("PROCESSADO"))
            .andExpect(jsonPath("$.situacao").value("A_CONFIRMAR"))
            .andExpect(jsonPath("$.dataRecebimento").doesNotExist()).andReturn().getResponse().getContentAsString();
        long id=((Number)JsonPath.read(resposta,"$.id")).longValue();
        mvc.perform(get("/api/porto/ordens-pagamento/{id}",id).header("Authorization","Bearer "+token))
            .andExpect(status().isOk()).andExpect(jsonPath("$.historico[0].evento").value("OP_CRIADA_MANUALMENTE"))
            .andExpect(jsonPath("$.historico[0].usuario").value("Administrador"));
    }

    @Test
    void pagamentoConfirmadoExigeDataEOpPermaneceUnica() throws Exception {
        String token=login();
        String corpo="""
            {"numero":"OP-MANUAL-UNICA","dataPrevista":"2026-09-16","valorInformado":500.00,
             "statusPorto":"PROCESSADO","situacaoFinanceira":"RECEBIDO","pagamentoConfirmado":true}
            """;
        mvc.perform(post("/api/porto/ordens-pagamento").header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON).content(corpo))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.detalhe").value(org.hamcrest.Matchers.containsString("data")));

        String valido=corpo.replace("}",",\"dataRecebimento\":\"2026-09-16\"}");
        mvc.perform(post("/api/porto/ordens-pagamento").header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON).content(valido))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.situacao").value("RECEBIDO"));
        mvc.perform(post("/api/porto/ordens-pagamento").header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON).content(valido))
            .andExpect(status().isBadRequest());
        mvc.perform(get("/api/porto/ordens-pagamento").param("numero","OP-MANUAL-UNICA")
                .header("Authorization","Bearer "+token))
            .andExpect(status().isOk()).andExpect(jsonPath("$",hasSize(1)));
    }

    private String login() throws Exception {
        String resposta=mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"admin@fluxogestao.local\",\"senha\":\"Admin@123\"}"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(resposta,"$.token");
    }
}
