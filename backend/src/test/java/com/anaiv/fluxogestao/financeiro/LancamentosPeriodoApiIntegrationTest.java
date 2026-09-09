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

import java.math.BigDecimal;
import java.sql.Date;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Entradas e saidas e fluxo de caixa pedem um periodo, mas o recorte era feito na memoria: o
 * backend trazia todo o historico e descartava quase tudo. Cada OS da Porto vira uma receita,
 * entao esse historico cresce centenas de linhas por mes. O teste fixa as duas coisas que
 * importam: as linhas certas voltam, e as linhas de fora do periodo nem saem do banco.
 */
@SpringBootTest(properties="spring.jpa.properties.hibernate.generate_statistics=true")
@AutoConfigureMockMvc @ActiveProfiles("test")
class LancamentosPeriodoApiIntegrationTest {
    private static final int POR_ANO=60;
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired EntityManagerFactory emf;

    @AfterEach void limpar(){
        jdbc.update("delete from receitas where descricao like 'Receita periodo %'");
        jdbc.update("delete from despesas where descricao like 'Despesa periodo %'");
    }

    @Test void extratoTrazSomenteOPeriodoPedidoESemCarregarOHistoricoInteiro() throws Exception {
        String token=login();
        long categoria=categoriaDeDespesa();
        long usuario=jdbc.queryForObject("select id from usuarios where email='admin@fluxogestao.local'",Long.class);
        for(int ano:List.of(2086,2087,2088))
            for(int i=1;i<=POR_ANO;i++){
                jdbc.update("insert into receitas (descricao,valor,data_competencia,data_recebimento,status,recorrente) values (?,?,?,?,?,false)",
                    "Receita periodo %d-%02d".formatted(ano,i),new BigDecimal("100.00"),Date.valueOf(ano+"-06-10"),Date.valueOf(ano+"-06-10"),"RECEBIDA");
                jdbc.update("insert into despesas (descricao,categoria_id,valor,data_lancamento,vencimento,data_pagamento,status,aprovada,criado_por_id) values (?,?,?,?,?,?,?,true,?)",
                    "Despesa periodo %d-%02d".formatted(ano,i),categoria,new BigDecimal("50.00"),Date.valueOf(ano+"-06-10"),Date.valueOf(ano+"-06-10"),Date.valueOf(ano+"-06-10"),"PAGO",usuario);
            }

        Statistics estatisticas=emf.unwrap(SessionFactory.class).getStatistics();
        estatisticas.clear();
        String corpo=mvc.perform(get("/api/lancamentos").param("inicio","2087-06-01").param("fim","2087-06-30")
                .header("Authorization","Bearer "+token))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        long carregadas=estatisticas.getEntityLoadCount();

        List<String> descricoes=JsonPath.read(corpo,"$[?(@.descricao =~ /(Receita|Despesa) periodo.*/)].descricao");
        assertThat(descricoes).hasSize(POR_ANO*2).allSatisfy(x->assertThat(x).contains("2087"));
        assertThat(carregadas)
            .describedAs("o extrato de um mes carregou %d entidades para devolver %d linhas",carregadas,POR_ANO*2)
            .isLessThan(POR_ANO*2L*2);
    }

    private long categoriaDeDespesa(){
        return jdbc.queryForObject("select id from categorias where tipo='DESPESA' order by id limit 1",Long.class);
    }

    private String login() throws Exception {
        String resposta=mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"admin@fluxogestao.local\",\"senha\":\"Admin@123\"}"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(resposta,"$.token");
    }
}
