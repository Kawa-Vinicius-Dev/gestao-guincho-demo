package com.anaiv.fluxogestao.financeiro;

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

/** Trava o numero de consultas da Visao Geral: o banco fica remoto (Supabase) e cada query custa uma ida e volta. */
@SpringBootTest(properties="spring.jpa.properties.hibernate.generate_statistics=true")
@AutoConfigureMockMvc @ActiveProfiles("test")
class DashboardConsultasApiIntegrationTest {
    private static final int TOTAL_RECEITAS=200;
    private static final int LIMITE_CONSULTAS=30;
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired EntityManagerFactory emf;

    @AfterEach void limpar(){
        jdbc.update("delete from receitas where descricao like 'Medicao consultas%'");
        jdbc.update("delete from despesas where descricao like 'Medicao consultas%'");
        jdbc.update("delete from categorias where nome='Medicao Consultas'");
        jdbc.update("delete from contratantes where nome='Medicao Consultas'");
    }

    @Test void visaoGeralNaoDisparaConsultasPorLancamento() throws Exception {
        String token=login();
        jdbc.update("insert into contratantes (nome) values ('Medicao Consultas')");
        jdbc.update("insert into categorias (nome,tipo) values ('Medicao Consultas','RECEITA')");
        long contratante=jdbc.queryForObject("select id from contratantes where nome='Medicao Consultas'",Long.class);
        long categoria=jdbc.queryForObject("select id from categorias where nome='Medicao Consultas'",Long.class);
        for(int indice=1;indice<=TOTAL_RECEITAS;indice++)
            jdbc.update("insert into receitas (contratante_id,categoria_id,descricao,valor,data_competencia,data_recebimento,status,recorrente) values (?,?,?,?,?,?,?,?)",
                contratante,categoria,"Medicao consultas %03d".formatted(indice),new java.math.BigDecimal("100.00"),
                java.sql.Date.valueOf("2091-07-10"),java.sql.Date.valueOf("2091-07-20"),"RECEBIDA",false);

        Statistics estatisticas=emf.unwrap(SessionFactory.class).getStatistics();
        estatisticas.clear();
        mvc.perform(get("/api/dashboard").param("inicio","2091-07-01").param("fim","2091-07-31")
                .header("Authorization","Bearer "+token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.receitaRecebida").value(TOTAL_RECEITAS*100.0));
        long consultas=estatisticas.getPrepareStatementCount();

        assertThat(consultas)
            .describedAs("visao geral com %d receitas disparou %d consultas",TOTAL_RECEITAS,consultas)
            .isLessThan(LIMITE_CONSULTAS);
    }

    private String login() throws Exception {
        String resposta=mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"admin@fluxogestao.local\",\"senha\":\"Admin@123\"}"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(resposta,"$.token");
    }
}
