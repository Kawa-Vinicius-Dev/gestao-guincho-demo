package com.anaiv.fluxogestao.auth;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Usa propriedades proprias (diferentes de application-test.yml) para nao compartilhar o
 * contexto Spring com o restante da suite: os outros testes fazem login repetidas vezes e
 * um limite baixo aqui derrubaria logins legitimos em classes sem nenhuma relacao com isso.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestPropertySource(properties = {
        "app.security.login.max-tentativas=3",
        "app.security.login.janela-minutos=15",
        "app.security.login.bloqueio-minutos=15"
})
class LoginRateLimitApiIntegrationTest {
    @Autowired MockMvc mvc;

    @Test
    void bloqueiaLoginAposVariasSenhasErradasMesmoQuandoASenhaCertaChega() throws Exception {
        tentar("admin@fluxogestao.local", "SenhaErrada", 400);
        tentar("admin@fluxogestao.local", "SenhaErrada", 400);
        tentar("admin@fluxogestao.local", "SenhaErrada", 400);

        tentar("admin@fluxogestao.local", "Admin@123", 429)
                .andExpect(jsonPath("$.detalhe").value(
                        "Muitas tentativas de login. Aguarde alguns minutos e tente novamente."));
    }

    private ResultActions tentar(String email, String senha, int statusEsperado) throws Exception {
        return mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"%s","senha":"%s"}
                                """.formatted(email, senha)))
                .andExpect(status().is(statusEsperado));
    }
}
