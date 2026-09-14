package com.anaiv.fluxogestao.config;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class SaudeApiIntegrationTest {
    @Autowired MockMvc mvc;

    /**
     * Quem chama e o agendador externo que mantem o Render acordado, e robo nao
     * faz login: se esta rota voltar a exigir token, o ping passa a responder 401,
     * o servico hiberna e o primeiro acesso do dia volta a travar por ~2 minutos.
     */
    @Test
    void saudeRespondeSemAutenticacao() throws Exception {
        mvc.perform(get("/api/health"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("ok"));
    }

    /** O resto da API continua fechado - liberar a saude nao pode abrir nada em volta. */
    @Test
    void demaisRotasSeguemExigindoToken() throws Exception {
        mvc.perform(get("/api/porto/ordens-servico")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/dashboard?inicio=2026-01-01&fim=2026-01-31")).andExpect(status().isUnauthorized());
    }
}
