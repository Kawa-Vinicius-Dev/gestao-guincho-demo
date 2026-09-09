package com.anaiv.fluxogestao.comissao;

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

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * O resumo de comissoes percorre todos os socorristas ativos e, para cada um, todas as OS do
 * periodo. Com o banco na rede, o custo e o NUMERO de consultas: este teste trava esse numero
 * para que nao volte a crescer por socorrista e por OS.
 */
@SpringBootTest(properties="spring.jpa.properties.hibernate.generate_statistics=true")
@AutoConfigureMockMvc @ActiveProfiles("test")
class ComissaoConsultasApiIntegrationTest {
    private static final int SOCORRISTAS=6;
    private static final int OS_POR_SOCORRISTA=20;
    private static final int LIMITE_CONSULTAS=15;
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired EntityManagerFactory emf;

    @AfterEach void limpar(){
        jdbc.update("delete from ordens_servico_porto where numero like 'OS-COMQ-%'");
        jdbc.update("delete from ordens_pagamento_porto where numero like 'OP-COMQ-%'");
        jdbc.update("delete from motoristas where qra like 'QRA-COMQ-%'");
        jdbc.update("delete from calendario_pagamentos_porto where data_pagamento='2089-03-05'");
    }

    @Test void resumoDeComissoesNaoConsultaOrdemDeServicoUmaAUma() throws Exception {
        String token=login();
        long calendario=cenario();

        long consultas=contarConsultas(()->mvc.perform(get("/api/comissoes/resumo")
                .param("calendarioPagamentoId",String.valueOf(calendario))
                .header("Authorization","Bearer "+token))
            .andExpect(status().isOk()));

        assertThat(consultas)
            .describedAs("resumo com %d socorristas e %d OS cada disparou %d consultas",SOCORRISTAS,OS_POR_SOCORRISTA,consultas)
            .isLessThan(LIMITE_CONSULTAS);
    }

    private long cenario(){
        jdbc.update("insert into calendario_pagamentos_porto (data_pagamento,competencia_inicio,competencia_fim,descricao,ativo) values (?,?,?,?,true)",
            Date.valueOf("2089-03-05"),Date.valueOf("2089-02-01"),Date.valueOf("2089-02-28"),"Ciclo sintético de comissão");
        long calendario=jdbc.queryForObject("select id from calendario_pagamentos_porto where data_pagamento=?",Long.class,Date.valueOf("2089-03-05"));
        jdbc.update("insert into ordens_pagamento_porto (numero,valor_total,data_pagamento_programada,data_recebimento,valor_recebido,situacao_financeira,calendario_pagamento_id) values (?,?,?,?,?,?,?)",
            "OP-COMQ-001",new BigDecimal("12000.00"),Date.valueOf("2089-03-05"),Date.valueOf("2089-03-05"),new BigDecimal("12000.00"),"RECEBIDO",calendario);
        long op=jdbc.queryForObject("select id from ordens_pagamento_porto where numero='OP-COMQ-001'",Long.class);
        for(int s=1;s<=SOCORRISTAS;s++){
            String qra="QRA-COMQ-%02d".formatted(s);
            jdbc.update("insert into motoristas (nome,qra,ativo) values (?,?,true)","Socorrista sintético "+s,qra);
            long motorista=jdbc.queryForObject("select id from motoristas where qra=?",Long.class,qra);
            for(int i=1;i<=OS_POR_SOCORRISTA;i++)
                jdbc.update("insert into ordens_servico_porto (numero,valor_total,especialidade,qra,data_atendimento,ordem_pagamento_id,motorista_id,status_financeiro_fluxo,data_efetiva_pagamento) values (?,?,?,?,?,?,?,?,?)",
                    "OS-COMQ-%02d-%03d".formatted(s,i),new BigDecimal("100.00"),"GUINCHO",qra,Date.valueOf("2089-02-10"),op,motorista,"RECEBIDO",Date.valueOf("2089-03-05"));
        }
        return calendario;
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
