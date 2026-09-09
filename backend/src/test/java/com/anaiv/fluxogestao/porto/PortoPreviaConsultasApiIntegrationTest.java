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
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * A previa e a primeira tela do fluxo real: o arquivo da Porto chega com centenas de OS. Como o
 * backend fala com o banco pela rede, o custo e proporcional ao NUMERO de consultas. Este teste
 * trava esse numero para que o resumo da previa nao volte a consultar OS por OS.
 */
@SpringBootTest(properties="spring.jpa.properties.hibernate.generate_statistics=true")
@AutoConfigureMockMvc @ActiveProfiles("test")
class PortoPreviaConsultasApiIntegrationTest {
    private static final int LINHAS=120;
    private static final int LIMITE_CONSULTAS=30;
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired EntityManagerFactory emf;

    @AfterEach void limpar(){
        jdbc.update("delete from registros_importados_porto where importacao_id in (select id from importacoes where nome_arquivo like 'previa-consultas%')");
        jdbc.update("delete from ordens_servico_porto where numero like 'OS-PREV-%'");
        jdbc.update("delete from importacoes where nome_arquivo like 'previa-consultas%'");
    }

    @Test void previaDeArquivoGrandeNaoConsultaOrdemDeServicoUmaAUma() throws Exception {
        String token=login();
        StringBuilder csv=new StringBuilder("Número da Ordem de Serviço,Valor Total,Especialidade,Sigla da Viatura,Socorrista,QRA,Data de atendimento\n");
        for(int i=1;i<=LINHAS;i++)csv.append("OS-PREV-%04d,100.00,GUINCHO,,SOCORRISTA PREVIA,QRA-PREVIA,2091-05-10%n".formatted(i));
        MockMultipartFile arquivo=new MockMultipartFile("arquivo","previa-consultas.csv","text/csv",csv.toString().getBytes(StandardCharsets.UTF_8));

        long consultas=contarConsultas(()->mvc.perform(multipart("/api/porto/importacoes/previa").file(arquivo)
                .header("Authorization","Bearer "+token))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.resumo.linhasAnalisadas").value(LINHAS))
            .andExpect(jsonPath("$.resumo.registrosNovos").value(LINHAS)));

        assertThat(consultas)
            .describedAs("previa de %d linhas disparou %d consultas (uma por OS)",LINHAS,consultas)
            .isLessThan(LIMITE_CONSULTAS);
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
