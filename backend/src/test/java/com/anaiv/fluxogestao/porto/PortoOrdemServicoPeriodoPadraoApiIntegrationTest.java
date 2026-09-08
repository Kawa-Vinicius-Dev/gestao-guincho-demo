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

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * A tela de ordens de servico carregava a tabela inteira. Ela passa a abrir num mes so: o mes
 * corrente quando ja tem servico lancado e, caso contrario, o mes do servico mais recente, para
 * nao abrir vazia quando o movimento do mes ainda nao comecou.
 */
@SpringBootTest @AutoConfigureMockMvc @ActiveProfiles("test")
class PortoOrdemServicoPeriodoPadraoApiIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    @AfterEach void limpar(){
        jdbc.update("delete from ordens_servico_porto where numero like 'OS-PADRAO-%'");
    }

    @Test void usaOMesCorrenteQuandoEleJaTemServico() throws Exception {
        LocalDate hoje=LocalDate.now();
        inserir("OS-PADRAO-HOJE",hoje);

        String periodo=periodoPadrao();
        assertThat((String)JsonPath.read(periodo,"$.dataInicio")).isEqualTo(hoje.withDayOfMonth(1).toString());
        assertThat((String)JsonPath.read(periodo,"$.dataFim")).isEqualTo(hoje.withDayOfMonth(hoje.lengthOfMonth()).toString());
    }

    @Test void semServicoNoMesCorrenteCaiNoMesDoServicoMaisRecente() throws Exception {
        inserir("OS-PADRAO-ANTIGA",LocalDate.now().minusMonths(3));
        LocalDate maisRecente=jdbc.queryForObject("select max(data_atendimento) from ordens_servico_porto",LocalDate.class);
        assertThat(maisRecente.getMonth()).describedAs("o mes corrente deve estar vazio neste teste").isNotEqualTo(LocalDate.now().getMonth());

        String periodo=periodoPadrao();
        assertThat((String)JsonPath.read(periodo,"$.dataInicio")).isEqualTo(maisRecente.withDayOfMonth(1).toString());
        assertThat((String)JsonPath.read(periodo,"$.dataFim")).isEqualTo(maisRecente.withDayOfMonth(maisRecente.lengthOfMonth()).toString());
    }

    @Test void listagemRespeitaOIntervaloInformado() throws Exception {
        inserir("OS-PADRAO-DENTRO",LocalDate.of(2074,3,10));
        inserir("OS-PADRAO-FORA",LocalDate.of(2074,4,10));

        mvc.perform(get("/api/porto/ordens-servico").param("dataInicio","2074-03-01").param("dataFim","2074-03-31")
                .param("numeroOs","OS-PADRAO").header("Authorization","Bearer "+login()))
            .andExpect(status().isOk())
            .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.length()").value(1))
            .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$[0].numero").value("OS-PADRAO-DENTRO"));
    }

    private void inserir(String numero,LocalDate data){
        jdbc.update("insert into ordens_servico_porto (numero,valor_total,especialidade,data_atendimento) values (?,?,?,?)",
            numero,new java.math.BigDecimal("100.00"),"GUINCHO",java.sql.Date.valueOf(data));
    }
    private String periodoPadrao() throws Exception {
        return mvc.perform(get("/api/porto/ordens-servico/periodo-padrao").header("Authorization","Bearer "+login()))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    }
    private String login() throws Exception {
        return JsonPath.read(mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
            .content("{\"email\":\"admin@fluxogestao.local\",\"senha\":\"Admin@123\"}"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(),"$.token");
    }
}
