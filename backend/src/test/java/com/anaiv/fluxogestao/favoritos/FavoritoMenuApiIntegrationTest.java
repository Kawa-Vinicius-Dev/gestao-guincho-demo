package com.anaiv.fluxogestao.favoritos;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class FavoritoMenuApiIntegrationTest {

    @Autowired MockMvc mvc;

    @Test
    void guardaNaOrdemEnviadaESubstituiALista() throws Exception {
        String token = login();

        salvar(token, "{\"rotas\":[\"/despesas\",\"/lancamentos\",\"/porto/ordens-pagamento\"]}");
        assertThat(this.<String>ler(token))
            .as("a ordem enviada e a ordem em que a pessoa arrumou os atalhos")
            .containsExactly("/despesas", "/lancamentos", "/porto/ordens-pagamento");

        // Substituicao completa: some o que saiu, fica o que ficou, entra o que entrou.
        salvar(token, "{\"rotas\":[\"/lancamentos\",\"/dre\"]}");
        assertThat(this.<String>ler(token)).containsExactly("/lancamentos", "/dre");
    }

    @Test
    void listaVaziaLimpaTudoERepetidaContaUmaVezSo() throws Exception {
        String token = login();
        salvar(token, "{\"rotas\":[\"/dre\",\"/dre\",\"/equipe\"]}");
        assertThat(this.<String>ler(token)).as("repetida nao duplica").containsExactly("/dre", "/equipe");

        salvar(token, "{\"rotas\":[]}");
        assertThat(this.<String>ler(token)).isEmpty();
    }

    @Test
    void recusaMaisAtalhosDoQueOTopoDoMenuComporta() throws Exception {
        String token = login();
        mvc.perform(put("/api/favoritos").header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"rotas\":[\"/1\",\"/2\",\"/3\",\"/4\",\"/5\",\"/6\",\"/7\",\"/8\",\"/9\"]}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void semTokenNaoLeNemGravaFavoritoDeNinguem() throws Exception {
        mvc.perform(get("/api/favoritos")).andExpect(status().isUnauthorized());
        mvc.perform(put("/api/favoritos").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"rotas\":[\"/dre\"]}"))
                .andExpect(status().isUnauthorized());
    }

    private void salvar(String token, String corpo) throws Exception {
        mvc.perform(put("/api/favoritos").header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content(corpo))
                .andExpect(status().isOk());
    }

    private <T> List<T> ler(String token) throws Exception {
        String json = mvc.perform(get("/api/favoritos").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(json, "$.rotas");
    }

    private String login() throws Exception {
        String json = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"admin@fluxogestao.local\",\"senha\":\"Admin@123\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.usuario.perfil").value("ADMINISTRADOR"))
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(json, "$.token");
    }
}
