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

/**
 * A analise do negocio e quinzenal, e a quinzena de uma OP vem do calendario Porto. A listagem
 * precisa expor esse periodo e permitir filtrar por ele, sem exigir que se saiba de cor as datas
 * de pagamento de cada ciclo.
 */
@SpringBootTest @AutoConfigureMockMvc @ActiveProfiles("test")
class PortoOrdemPagamentoPeriodoApiIntegrationTest {
    @Autowired MockMvc mvc;

    @Test void listaExpoeOPeriodoEFiltraPorQuinzena() throws Exception {
        String token=login();
        long primeira=id(criar(token,"/api/porto/calendario",
            "{\"dataPagamento\":\"2073-09-16\",\"competenciaInicio\":\"2073-08-16\",\"competenciaFim\":\"2073-08-31\",\"descricao\":\"1o ciclo\",\"ativo\":true}"));
        long segunda=id(criar(token,"/api/porto/calendario",
            "{\"dataPagamento\":\"2073-09-30\",\"competenciaInicio\":\"2073-09-01\",\"competenciaFim\":\"2073-09-15\",\"descricao\":\"2o ciclo\",\"ativo\":true}"));
        criarOp(token,"OP-PERIODO-A","2073-09-16");
        criarOp(token,"OP-PERIODO-B","2073-09-30");

        // o rotulo da quinzena vem junto da OP
        mvc.perform(get("/api/porto/ordens-pagamento").param("numero","OP-PERIODO-A").header("Authorization","Bearer "+token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].periodoFinanceiro").value("16/08/2073 a 31/08/2073"))
            .andExpect(jsonPath("$[0].calendarioPagamentoId").value((int)primeira));

        // filtrar por quinzena traz so a OP daquele ciclo
        mvc.perform(get("/api/porto/ordens-pagamento").param("calendarioPagamentoId",String.valueOf(segunda))
                .param("numero","OP-PERIODO").header("Authorization","Bearer "+token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(1))
            .andExpect(jsonPath("$[0].numero").value("OP-PERIODO-B"));

        // o resumo respeita o mesmo filtro
        mvc.perform(get("/api/porto/ordens-pagamento/resumo").param("calendarioPagamentoId",String.valueOf(primeira))
                .param("numero","OP-PERIODO").header("Authorization","Bearer "+token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.quantidadeTotalOps").value(1));
    }

    private void criarOp(String token,String numero,String dataPrevista) throws Exception {
        criar(token,"/api/porto/ordens-pagamento","{\"numero\":\""+numero+"\",\"dataPrevista\":\""+dataPrevista
            +"\",\"valorInformado\":500.00,\"statusPorto\":\"PROCESSADO\",\"situacaoFinanceira\":\"PROGRAMADO\",\"pagamentoConfirmado\":false}");
    }
    private long id(String json){ return ((Number)JsonPath.read(json,"$.id")).longValue(); }
    private String criar(String token,String caminho,String corpo) throws Exception {
        return mvc.perform(post(caminho).header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON).content(corpo))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
    }
    private String login() throws Exception {
        return JsonPath.read(mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
            .content("{\"email\":\"admin@fluxogestao.local\",\"senha\":\"Admin@123\"}"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(),"$.token");
    }
}
