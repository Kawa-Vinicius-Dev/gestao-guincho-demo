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

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * A Porto entrega apenas as datas de pagamento e a periodicidade, sem a competencia. A competencia
 * e derivada da posicao do pagamento no mes: o 1o pagamento cobre a 1a quinzena do mes anterior e o
 * 2o cobre a 2a quinzena. A regra foi conferida contra as dez datas ja cadastradas no calendario.
 */
@SpringBootTest @AutoConfigureMockMvc @ActiveProfiles("test")
class PortoCalendarioColagemApiIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    @AfterEach void limpar(){
        jdbc.update("delete from calendario_pagamentos_porto where data_pagamento in ('2081-09-16','2081-09-30','2081-12-14','2081-12-30')");
    }

    @Test void colaCalendarioDaPortoDerivandoCompetencia() throws Exception {
        String token=login();
        String resposta=colar(token,"""
            Classificar por:
            Datas Referente ao Ano Corrente
            Classificado: nenhum

            16/09/2081
            15 Dias
            30/09/2081
            15 Dias
            14/12/2081
            15 Dias
            30/12/2081
            15 Dias
            """);

        assertThat((Integer)JsonPath.read(resposta,"$.criados")).isEqualTo(4);
        assertThat((Integer)JsonPath.read(resposta,"$.ignorados")).isZero();

        // 1o pagamento do mes cobre a 1a quinzena do mes anterior
        assertThat(competencia("2081-09-16")).isEqualTo("2081-08-01|2081-08-15");
        // 2o pagamento do mes cobre a 2a quinzena do mes anterior
        assertThat(competencia("2081-09-30")).isEqualTo("2081-08-16|2081-08-31");
        // dia irregular (14/12) nao muda a regra: continua sendo o 1o pagamento do mes
        assertThat(competencia("2081-12-14")).isEqualTo("2081-11-01|2081-11-15");
        assertThat(competencia("2081-12-30")).isEqualTo("2081-11-16|2081-11-30");
    }

    @Test void colagemRepetidaNaoDuplicaDatasJaCadastradas() throws Exception {
        String token=login();
        colar(token,"16/09/2081\n15 Dias\n");
        String segunda=colar(token,"16/09/2081\n15 Dias\n30/09/2081\n15 Dias\n");

        assertThat((Integer)JsonPath.read(segunda,"$.criados")).isEqualTo(1);
        assertThat((Integer)JsonPath.read(segunda,"$.ignorados")).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from calendario_pagamentos_porto where data_pagamento='2081-09-16'",Integer.class)).isOne();
    }

    @Test void recusaColagemSemDataReconhecida() throws Exception {
        mvc.perform(post("/api/porto/calendario/colagem").header("Authorization","Bearer "+login())
            .contentType(MediaType.APPLICATION_JSON).content("{\"conteudo\":\"Classificado: nenhum\\n15 Dias\\n\"}"))
            .andExpect(status().isBadRequest());
    }

    private String colar(String token,String conteudo) throws Exception {
        return mvc.perform(post("/api/porto/calendario/colagem").header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"conteudo\":\""+conteudo.replace("\n","\\n")+"\"}"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    }

    private String competencia(String dataPagamento) {
        return jdbc.queryForObject("select competencia_inicio || '|' || competencia_fim from calendario_pagamentos_porto where data_pagamento=?",
            String.class,java.sql.Date.valueOf(dataPagamento));
    }

    private String login() throws Exception {
        return JsonPath.read(mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
            .content("{\"email\":\"admin@fluxogestao.local\",\"senha\":\"Admin@123\"}"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(),"$.token");
    }
}
