package com.anaiv.fluxogestao.auth;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AuthApiIntegrationTest {
    @Autowired MockMvc mvc;

    @Test
    void credencialLocalExibidaRetornaTokenRealEAcessaPorto() throws Exception {
        String resposta = login("admin@fluxogestao.local", "Admin@123", 200);
        String token = JsonPath.read(resposta, "$.token");

        assertThat(token).isNotBlank().doesNotStartWith("demo:");
        mvc.perform(get("/api/porto/ordens-pagamento")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
    }

    @Test
    void loginNormalizaEspacosECaixaDoEmail() throws Exception {
        String resposta = login("  ADMIN@FLUXOGESTAO.LOCAL  ", "Admin@123", 200);
        assertThat((String) JsonPath.read(resposta, "$.usuario.email"))
                .isEqualTo("admin@fluxogestao.local");
    }

    @Test
    void senhaIncorretaEUsuarioInexistenteRetornamMensagemClara() throws Exception {
        login("admin@fluxogestao.local", "SenhaIncorreta", 400);
        login("inexistente@fluxogestao.local", "Admin@123", 400);
    }

    @Test
    void tokenDemoContinuaRejeitado() throws Exception {
        mvc.perform(get("/api/porto/ordens-pagamento")
                        .header("Authorization", "Bearer demo:admin"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void cadastroNormalizaEmailENaoDuplicaVariacoesEquivalentes() throws Exception {
        String token = JsonPath.read(login("admin@fluxogestao.local", "Admin@123", 200), "$.token");

        mvc.perform(post("/api/usuarios")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"nome":"Usuário Sintético","email":"  Usuario.Caixa@Example.com  ",
                                 "senha":"Usuario@123","perfil":"FUNCIONARIO"}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.email").value("usuario.caixa@example.com"));

        mvc.perform(post("/api/usuarios")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"nome":"Usuário Duplicado","email":"USUARIO.CAIXA@example.COM",
                                 "senha":"Usuario@123","perfil":"FUNCIONARIO"}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detalhe").value("Já existe um usuário com este e-mail."));
    }

    private String login(String email, String senha, int statusEsperado) throws Exception {
        var resultado = mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"%s","senha":"%s"}
                                """.formatted(email, senha)))
                .andExpect(status().is(statusEsperado));
        if (statusEsperado == 400) {
            resultado.andExpect(jsonPath("$.detalhe").value("E-mail ou senha inválidos."));
        }
        return resultado.andReturn().getResponse().getContentAsString();
    }
}
