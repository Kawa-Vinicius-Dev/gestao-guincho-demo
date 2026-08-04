package com.anaiv.fluxogestao.porto;

import com.anaiv.fluxogestao.service.CalendarioPortoService;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PortoCalendarioApiIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired CalendarioPortoService calendario;

    @Test
    void listaDatasIniciaisECalculaProximoCicloAtivo() throws Exception {
        String token=login();
        mvc.perform(get("/api/porto/calendario").header("Authorization","Bearer "+token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[?(@.dataPagamento == '2026-08-14')]").isNotEmpty())
            .andExpect(jsonPath("$[?(@.dataPagamento == '2026-12-30')]").isNotEmpty());

        assertThat(calendario.proximaDataAtiva(LocalDate.of(2026,8,14)))
            .isEqualTo(LocalDate.of(2026,8,28));
        assertThat(calendario.ciclosUltrapassados(LocalDate.of(2026,8,14),LocalDate.of(2026,8,28)))
            .isEqualTo(1);
    }

    @Test
    void adicionaEditaEDesativaUmaDataSemApagaLa() throws Exception {
        String token=login();
        String criada=mvc.perform(post("/api/porto/calendario").header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"dataPagamento\":\"2027-01-15\",\"descricao\":\"Ciclo sintético\",\"ativo\":true}"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.ativo").value(true))
            .andReturn().getResponse().getContentAsString();
        long id=((Number)JsonPath.read(criada,"$.id")).longValue();

        mvc.perform(put("/api/porto/calendario/{id}",id).header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"dataPagamento\":\"2027-01-16\",\"descricao\":\"Ciclo revisado\",\"ativo\":true}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.dataPagamento").value("2027-01-16"))
            .andExpect(jsonPath("$.descricao").value("Ciclo revisado"));

        mvc.perform(patch("/api/porto/calendario/{id}/desativar",id).header("Authorization","Bearer "+token))
            .andExpect(status().isOk()).andExpect(jsonPath("$.ativo").value(false));
        mvc.perform(get("/api/porto/calendario").header("Authorization","Bearer "+token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[?(@.id == "+id+")].ativo").value(false));
    }

    private String login() throws Exception {
        String resposta=mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"admin@fluxogestao.local\",\"senha\":\"Admin@123\"}"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(resposta,"$.token");
    }
}
