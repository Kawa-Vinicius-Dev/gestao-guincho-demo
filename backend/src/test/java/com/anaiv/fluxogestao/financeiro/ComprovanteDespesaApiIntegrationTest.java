package com.anaiv.fluxogestao.financeiro;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ComprovanteDespesaApiIntegrationTest {

    @Autowired MockMvc mvc;

    @Test
    void administradorAnexaConsultaERemoveOComprovante() throws Exception {
        String admin = login();
        long categoria = id(criar(admin, "/api/categorias", """
                {"nome":"Combustível comprovante","tipo":"DESPESA"}
                """));
        long despesaId = id(criar(admin, "/api/despesas", """
                {"descricao":"Abastecimento com nota","categoriaId":%d,"valor":250.00,
                 "data":"2026-08-01","status":"PENDENTE"}
                """.formatted(categoria)));

        MockMultipartFile arquivo = new MockMultipartFile("arquivo", "nota-fiscal.pdf", "application/pdf",
                "conteudo simulado do pdf".getBytes());

        String resposta = mvc.perform(multipart("/api/despesas/{id}/comprovante", despesaId)
                        .file(arquivo).header("Authorization", "Bearer " + admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.comprovanteNomeOriginal").value("nota-fiscal.pdf"))
                .andReturn().getResponse().getContentAsString();
        assertThat(((Number) JsonPath.read(resposta, "$.comprovanteTamanhoBytes")).longValue())
                .isEqualTo(arquivo.getSize());

        String url = mvc.perform(get("/api/despesas/{id}/comprovante", despesaId)
                        .header("Authorization", "Bearer " + admin))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertThat((String) JsonPath.read(url, "$.url")).startsWith("memoria://despesas/" + despesaId + "/");

        mvc.perform(delete("/api/despesas/{id}/comprovante", despesaId)
                        .header("Authorization", "Bearer " + admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.comprovanteNomeOriginal").doesNotExist());

        mvc.perform(get("/api/despesas/{id}/comprovante", despesaId)
                        .header("Authorization", "Bearer " + admin))
                .andExpect(status().isNotFound());
    }

    @Test
    void rejeitaArquivoDeTipoNaoAceito() throws Exception {
        String admin = login();
        long categoria = id(criar(admin, "/api/categorias", """
                {"nome":"Manutenção comprovante","tipo":"DESPESA"}
                """));
        long despesaId = id(criar(admin, "/api/despesas", """
                {"descricao":"Troca de óleo","categoriaId":%d,"valor":180.00,
                 "data":"2026-08-02","status":"PENDENTE"}
                """.formatted(categoria)));

        MockMultipartFile arquivo = new MockMultipartFile("arquivo", "nota.txt", "text/plain", "texto".getBytes());

        mvc.perform(multipart("/api/despesas/{id}/comprovante", despesaId)
                        .file(arquivo).header("Authorization", "Bearer " + admin))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detalhe").value("Envie um comprovante em PDF, JPG, PNG ou WEBP."));
    }

    @Test
    void socorristaAnexaNaPropriaDespesaMasNaoNaDeOutroUsuario() throws Exception {
        String admin = login();
        criar(admin, "/api/usuarios", """
                {"nome":"Socorrista Comprovante","email":"socorrista.comprovante@fluxogestao.local",
                 "senha":"Socorro@123","perfil":"FUNCIONARIO"}
                """);
        String socorrista = JsonPath.read(mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"socorrista.comprovante@fluxogestao.local\",\"senha\":\"Socorro@123\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(), "$.token");

        long categoria = id(criar(admin, "/api/categorias", """
                {"nome":"Pedágio comprovante","tipo":"DESPESA"}
                """));
        long despesaPropria = id(criar(socorrista, "/api/despesas", """
                {"descricao":"Pedágio da rota","categoriaId":%d,"valor":22.00,
                 "data":"2026-08-03","status":"PENDENTE"}
                """.formatted(categoria)));
        long despesaAlheia = id(criar(admin, "/api/despesas", """
                {"descricao":"Despesa lançada pelo admin","categoriaId":%d,"valor":90.00,
                 "data":"2026-08-03","status":"PENDENTE"}
                """.formatted(categoria)));

        MockMultipartFile arquivo = new MockMultipartFile("arquivo", "pedagio.jpg", "image/jpeg", "foto".getBytes());

        mvc.perform(multipart("/api/despesas/{id}/comprovante", despesaPropria)
                        .file(arquivo).header("Authorization", "Bearer " + socorrista))
                .andExpect(status().isOk());

        mvc.perform(multipart("/api/despesas/{id}/comprovante", despesaAlheia)
                        .file(arquivo).header("Authorization", "Bearer " + socorrista))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detalhe").value("Você só pode gerenciar o comprovante das despesas que lançou."));
    }

    private String login() throws Exception {
        String json = mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"admin@fluxogestao.local","senha":"Admin@123"}
                                """))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(json, "$.token");
    }

    private String criar(String token, String path, String body) throws Exception {
        return mvc.perform(post(path)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
    }

    private long id(String json) {
        Number id = JsonPath.read(json, "$.id");
        return id.longValue();
    }
}
