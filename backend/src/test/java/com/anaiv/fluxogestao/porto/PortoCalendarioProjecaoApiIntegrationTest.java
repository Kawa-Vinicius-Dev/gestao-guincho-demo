package com.anaiv.fluxogestao.porto;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * A Porto entrega o calendario com meses de antecedencia e ele acaba - o cadastrado termina em
 * 30/12/2026. Quando acabava, a importacao travava. Agora o sistema projeta os ciclos seguintes
 * pelo padrao dos que a Porto ja informou, marcados como estimados ate alguem confirmar.
 */
@SpringBootTest
@AutoConfigureMockMvc @ActiveProfiles("test")
class PortoCalendarioProjecaoApiIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    @Test void projetaOsCiclosSeguintesSemInventarEmCimaDoQueAPortoJaInformou() throws Exception {
        String token=login();
        List<Map<String,Object>> ciclos=JsonPath.read(mvc.perform(get("/api/porto/calendario").header("Authorization","Bearer "+token))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(),"$");

        LocalDate hoje=LocalDate.now();
        assertThat(ciclos).isNotEmpty();
        // o calendario alcanca meses a frente de hoje, que e o que faltava
        LocalDate maiorData=ciclos.stream().map(c->LocalDate.parse((String)c.get("dataPagamento"))).max(LocalDate::compareTo).orElseThrow();
        assertThat(maiorData).isAfter(hoje.plusMonths(4));

        for(Map<String,Object> ciclo:ciclos){
            LocalDate pagamento=LocalDate.parse((String)ciclo.get("dataPagamento"));
            if(!Boolean.TRUE.equals(ciclo.get("estimado")))continue;
            // projecao nunca cai em fim de semana
            assertThat(pagamento.getDayOfWeek()).isNotIn(DayOfWeek.SATURDAY,DayOfWeek.SUNDAY);
            LocalDate inicio=LocalDate.parse((String)ciclo.get("competenciaInicio"));
            LocalDate fim=LocalDate.parse((String)ciclo.get("competenciaFim"));
            // dia 16 paga a segunda quinzena do mes anterior; dia 30 paga a primeira do proprio mes
            if(pagamento.getDayOfMonth()<20){
                assertThat(inicio).isEqualTo(pagamento.withDayOfMonth(1).minusMonths(1).withDayOfMonth(16));
                assertThat(fim).isEqualTo(inicio.withDayOfMonth(inicio.lengthOfMonth()));
            }else{
                assertThat(inicio).isEqualTo(pagamento.withDayOfMonth(1));
                assertThat(fim).isEqualTo(pagamento.withDayOfMonth(15));
            }
        }

        // o que a Porto informou continua como estava: a projecao nao duplica competencia
        assertThat(jdbc.queryForObject("select estimado from calendario_pagamentos_porto where data_pagamento='2026-12-14'",Boolean.class)).isFalse();
        assertThat(jdbc.queryForObject(
            "select count(*) from calendario_pagamentos_porto where competencia_inicio='2026-11-16' and competencia_fim='2026-11-30'",Integer.class))
            .isOne();
    }

    @Test void confirmarUmCicloProjetadoTiraAMarcaDeEstimado() throws Exception {
        String token=login();
        String corpo=mvc.perform(get("/api/porto/calendario").header("Authorization","Bearer "+token))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        List<Map<String,Object>> estimados=JsonPath.read(corpo,"$[?(@.estimado == true)]");
        assertThat(estimados).describedAs("a projecao precisa criar ao menos um ciclo").isNotEmpty();
        Map<String,Object> alvo=estimados.getFirst();
        long id=((Number)alvo.get("id")).longValue();

        // a Porto antecipou a data: o dono corrige na tela e o ciclo passa a valer como informado
        LocalDate corrigida=LocalDate.parse((String)alvo.get("dataPagamento")).minusDays(2);
        mvc.perform(put("/api/porto/calendario/{id}",id).header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"dataPagamento\":\""+corrigida+"\",\"competenciaInicio\":\""+alvo.get("competenciaInicio")
                    +"\",\"competenciaFim\":\""+alvo.get("competenciaFim")+"\",\"descricao\":\""+alvo.get("descricao")+"\",\"ativo\":true}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.estimado").value(false))
            .andExpect(jsonPath("$.dataPagamento").value(corrigida.toString()));

        // e uma nova passagem da projecao nao recria a data antiga por cima
        mvc.perform(get("/api/porto/calendario").header("Authorization","Bearer "+token)).andExpect(status().isOk());
        assertThat(jdbc.queryForObject("select count(*) from calendario_pagamentos_porto where competencia_inicio=? and competencia_fim=?",
            Integer.class,alvo.get("competenciaInicio"),alvo.get("competenciaFim"))).isOne();
    }

    private String login() throws Exception {
        String corpo=mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"admin@fluxogestao.local\",\"senha\":\"Admin@123\"}"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(corpo,"$.token");
    }
}
