package com.anaiv.fluxogestao.porto;

import com.jayway.jsonpath.JsonPath;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * O backend roda separado do banco (Render + Supabase), entao cada consulta paga uma ida e volta
 * de rede. O custo das telas e proporcional ao NUMERO de consultas, nao ao tempo medido localmente
 * com H2. Estes testes travam esse numero para que o N+1 por ordem de pagamento nao volte.
 */
@SpringBootTest(properties="spring.jpa.properties.hibernate.generate_statistics=true")
@AutoConfigureMockMvc @ActiveProfiles("test")
class PortoDashboardConsultasApiIntegrationTest {
    private static final int TOTAL_OPS=40;
    private static final int OS_POR_OP=5;
    private static final int LIMITE_CONSULTAS=30;
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired EntityManagerFactory emf;

    @AfterEach void limpar(){
        jdbc.update("delete from ordens_servico_porto where numero like 'OS-DASH-%' or numero like 'OS-LISTA-%' or numero like 'OS-OSS-%'");
        jdbc.update("delete from ordens_pagamento_porto where numero like 'OP-DASH-%' or numero like 'OP-LISTA-%' or numero like 'OP-OSS-%'");
    }

    @Test void dashboardPortoNaoDisparaConsultasPorOrdemDePagamento() throws Exception {
        String token=login();
        cenario("DASH","2093-07-10","2093-08-14");

        long consultas=contarConsultas(()->mvc.perform(get("/api/porto/dashboard")
                .param("periodo","PERSONALIZADO").param("dataInicio","2093-07-01").param("dataFim","2093-07-31")
                .header("Authorization","Bearer "+token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.quantidadeTotalServicos").value(TOTAL_OPS*OS_POR_OP)));

        assertThat(consultas)
            .describedAs("dashboard Porto com %d OPs disparou %d consultas (N+1 por OP)",TOTAL_OPS,consultas)
            .isLessThan(LIMITE_CONSULTAS);
    }

    @Test void listagemDeOrdensPagamentoNaoDisparaConsultasPorOrdemDePagamento() throws Exception {
        String token=login();
        cenario("LISTA","2094-07-10","2094-08-14");

        long consultas=contarConsultas(()->mvc.perform(get("/api/porto/ordens-pagamento")
            .header("Authorization","Bearer "+token)).andExpect(status().isOk()));

        assertThat(consultas)
            .describedAs("listagem de OPs disparou %d consultas (N+1 por OP)",consultas)
            .isLessThan(LIMITE_CONSULTAS);
    }

    @Test void listagemDeOrdensServicoNaoDisparaConsultasPorOrdemDePagamento() throws Exception {
        String token=login();
        cenario("OSS","2095-07-10","2095-08-14");

        long consultas=contarConsultas(()->mvc.perform(get("/api/porto/ordens-servico")
            .header("Authorization","Bearer "+token)).andExpect(status().isOk()));

        assertThat(consultas)
            .describedAs("listagem de OS disparou %d consultas (N+1 por OP)",consultas)
            .isLessThan(LIMITE_CONSULTAS);
    }

    private void cenario(String sufixo,String atendimento,String pagamento) {
        for(int op=1;op<=TOTAL_OPS;op++){
            String numeroOp="OP-%s-%03d".formatted(sufixo,op);
            jdbc.update("insert into ordens_pagamento_porto (numero,valor_total,data_pagamento_programada) values (?,?,?)",
                numeroOp,new java.math.BigDecimal("500.00"),java.sql.Date.valueOf(pagamento));
            long opId=jdbc.queryForObject("select id from ordens_pagamento_porto where numero=?",Long.class,numeroOp);
            for(int os=1;os<=OS_POR_OP;os++)
                jdbc.update("insert into ordens_servico_porto (numero,valor_total,especialidade,qra,data_atendimento,ordem_pagamento_id,data_efetiva_pagamento) values (?,?,?,?,?,?,?)",
                    "OS-%s-%03d-%02d".formatted(sufixo,op,os),new java.math.BigDecimal("100.00"),"GUINCHO","QRA-%s".formatted(sufixo),
                    java.sql.Date.valueOf(atendimento),opId,java.sql.Date.valueOf(pagamento));
        }
    }

    private long contarConsultas(Chamada chamada) throws Exception {
        Statistics estatisticas=emf.unwrap(SessionFactory.class).getStatistics();
        estatisticas.clear();
        chamada.executar();
        return estatisticas.getPrepareStatementCount();
    }

    private interface Chamada { void executar() throws Exception; }

    private String login() throws Exception {
        String resposta=mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"admin@fluxogestao.local\",\"senha\":\"Admin@123\"}"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(resposta,"$.token");
    }
}
