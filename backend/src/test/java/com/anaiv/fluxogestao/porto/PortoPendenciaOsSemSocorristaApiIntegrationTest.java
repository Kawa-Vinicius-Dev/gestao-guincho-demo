package com.anaiv.fluxogestao.porto;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Uma OS sem socorrista so aparecia na tela de importacao, no momento em que era importada. Quem
 * fechasse a tela perdia o rastro. Ela passa a constar tambem em Pendencias, que e onde o
 * operacional procura o que precisa ser resolvido.
 */
@SpringBootTest @AutoConfigureMockMvc @ActiveProfiles("test")
class PortoPendenciaOsSemSocorristaApiIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    @AfterEach void limpar(){
        jdbc.update("delete from ordens_servico_porto where numero like 'OS-PEND-%'");
        jdbc.update("delete from motoristas where qra='990001'");
    }

    @Test void listaAsOsSemSocorristaComOMotivoDaFalta() throws Exception {
        String token=login();
        long motorista=((Number)JsonPath.read(mvc.perform(post("/api/motoristas").header("Authorization","Bearer "+token)
            .contentType(MediaType.APPLICATION_JSON).content("{\"nome\":\"SOCORRISTA PENDENCIA\",\"qra\":\"990001\"}"))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(),"$.id")).longValue();

        jdbc.update("insert into ordens_servico_porto (numero,valor_total,especialidade,qra,data_atendimento,motorista_id) values (?,?,?,?,?,?)",
            "OS-PEND-ASSOCIADA",new java.math.BigDecimal("100.00"),"GUINCHO","990001",java.sql.Date.valueOf("2076-05-10"),motorista);
        jdbc.update("insert into ordens_servico_porto (numero,valor_total,especialidade,qra,data_atendimento) values (?,?,?,?,?)",
            "OS-PEND-QRA-DESCONHECIDO",new java.math.BigDecimal("200.00"),"GUINCHO","998877",java.sql.Date.valueOf("2076-05-11"));
        jdbc.update("insert into ordens_servico_porto (numero,valor_total,especialidade,data_atendimento) values (?,?,?,?)",
            "OS-PEND-SEM-QRA",new java.math.BigDecimal("300.00"),"GUINCHO",java.sql.Date.valueOf("2076-05-12"));

        String pendencias=mvc.perform(get("/api/porto/pendencias").header("Authorization","Bearer "+token))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();

        List<String> semSocorrista=JsonPath.read(pendencias,"$[?(@.tipo=='OS_SEM_SOCORRISTA')].referencia");
        assertThat(semSocorrista).contains("OS-PEND-QRA-DESCONHECIDO","OS-PEND-SEM-QRA");
        assertThat(semSocorrista).doesNotContain("OS-PEND-ASSOCIADA");

        // o motivo distingue quem nao trouxe QRA de quem trouxe um QRA que nao esta cadastrado
        List<String> motivoSemQra=JsonPath.read(pendencias,"$[?(@.referencia=='OS-PEND-SEM-QRA')].motivo");
        assertThat(motivoSemQra.getFirst()).contains("sem QRA");
        List<String> motivoDesconhecido=JsonPath.read(pendencias,"$[?(@.referencia=='OS-PEND-QRA-DESCONHECIDO')].motivo");
        assertThat(motivoDesconhecido.getFirst()).contains("998877");
    }

    private String login() throws Exception {
        return JsonPath.read(mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
            .content("{\"email\":\"admin@fluxogestao.local\",\"senha\":\"Admin@123\"}"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(),"$.token");
    }
}
