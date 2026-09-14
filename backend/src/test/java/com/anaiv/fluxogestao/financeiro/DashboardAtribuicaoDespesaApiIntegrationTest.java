package com.anaiv.fluxogestao.financeiro;

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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class DashboardAtribuicaoDespesaApiIntegrationTest {

    @Autowired MockMvc mvc;

    /**
     * Despesa com viatura e custo da viatura, mesmo quando o socorrista que abasteceu
     * foi anotado nela. Em producao, tres abastecimentos de R$ 570 no L168 lancados
     * pelo Natanael apareciam no custo do L168 E no custo do Natanael: R$ 1.710 contados
     * duas vezes, e o socorrista parecendo caro por gastar combustivel da empresa.
     * Cada despesa tem que cair em um lugar so.
     */
    @Test
    void despesaComViaturaFicaSoNaViaturaEAPessoalFicaSoNaPessoa() throws Exception {
        String token = login();
        long categoria = id(criar(token, "/api/categorias", """
                {"nome":"Combustivel atribuicao","tipo":"DESPESA"}
                """));
        long veiculo = id(criar(token, "/api/veiculos", """
                {"identificacao":"L168 atribuicao","placa":"ATR1B68","modelo":"Daily","custoPorKm":1.30}
                """));
        long socorrista = id(criar(token, "/api/motoristas", """
                {"nome":"Socorrista atribuicao","qra":"ATR-168"}
                """));

        // Abastecimento do veiculo, lancado com o socorrista que abasteceu.
        aprovar(token, id(criar(token, "/api/despesas", """
                {"descricao":"Gasolina","categoriaId":%d,"valor":570.00,"data":"2043-02-10",
                 "dataPagamento":"2043-02-10","veiculoId":%d,"motoristaId":%d,"status":"PAGO"}
                """.formatted(categoria, veiculo, socorrista))));
        // Despesa da pessoa, sem viatura nenhuma.
        aprovar(token, id(criar(token, "/api/despesas", """
                {"descricao":"Despesa pessoal","categoriaId":%d,"valor":45.00,"data":"2043-02-11",
                 "dataPagamento":"2043-02-11","motoristaId":%d,"status":"PAGO"}
                """.formatted(categoria, socorrista))));

        String dashboard = mvc.perform(get("/api/dashboard").header("Authorization", "Bearer " + token)
                        .param("inicio", "2043-02-01").param("fim", "2043-02-28"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        List<Number> custoDoVeiculo = JsonPath.read(dashboard,
                "$.resultadoPorVeiculo[?(@.veiculoId == " + veiculo + ")].despesas");
        List<Number> despesasDoSocorrista = JsonPath.read(dashboard,
                "$.resultadoPorSocorrista[?(@.motoristaId == " + socorrista + ")].despesas");

        assertThat(custoDoVeiculo).as("o abastecimento e custo da viatura").hasSize(1);
        assertThat(custoDoVeiculo.getFirst().doubleValue()).isEqualTo(570.0);
        assertThat(despesasDoSocorrista).as("a pessoa carrega so o que e dela").hasSize(1);
        assertThat(despesasDoSocorrista.getFirst().doubleValue()).isEqualTo(45.0);
    }

    private void aprovar(String token, long despesaId) throws Exception {
        mvc.perform(patch("/api/despesas/{id}/aprovar", despesaId).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
    }

    private String login() throws Exception {
        String json = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"admin@fluxogestao.local","senha":"Admin@123"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.usuario.perfil").value("ADMINISTRADOR"))
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(json, "$.token");
    }

    private String criar(String token, String path, String body) throws Exception {
        return mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(path)
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
