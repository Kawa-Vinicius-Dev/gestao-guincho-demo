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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * "Para onde o dinheiro foi": a despesa paga do periodo somada por categoria.
 *
 * A pergunta que o dono do guincho faz ao abrir o sistema e qual categoria pesou
 * mais no mes - combustivel, manutencao, alimentacao. Ate aqui isso exigia abrir
 * a tela de despesas e somar na mao.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class DashboardGastoPorCategoriaApiIntegrationTest {

    @Autowired MockMvc mvc;

    @Test
    void somaPorCategoriaDaMaiorParaAMenorEUsaAMesmaBaseDoTotalPago() throws Exception {
        String token = login();
        long combustivel = id(criar(token, "/api/categorias", """
                {"nome":"Combustivel categoria","tipo":"DESPESA"}"""));
        long manutencao = id(criar(token, "/api/categorias", """
                {"nome":"Manutencao categoria","tipo":"DESPESA"}"""));

        // Duas despesas de combustivel: tem de somar numa categoria e num mesmo dia.
        // A primeira foi lancada no dia 4, mas paga no dia 5: a serie usa o pagamento.
        aprovar(token, id(despesa(token, "Diesel", combustivel, "600.00", "2044-03-04", "2044-03-05")));
        aprovar(token, id(despesa(token, "Diesel de novo", combustivel, "200.00", "2044-03-05")));
        aprovar(token, id(despesa(token, "Pastilha", manutencao, "200.00", "2044-03-07")));

        // Aprovada mas ainda nao paga: fica de fora, como fica do total de despesas pagas.
        id(despesa(token, "Ainda nao paga", manutencao, "999.00", "2044-03-08"));

        String dashboard = mvc.perform(get("/api/dashboard").header("Authorization", "Bearer " + token)
                        .param("inicio", "2044-03-01").param("fim", "2044-03-31"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        List<String> nomes = JsonPath.read(dashboard, "$.despesasPorCategoria[*].categoria");
        List<Number> valores = JsonPath.read(dashboard, "$.despesasPorCategoria[*].valor");
        List<Number> participacoes = JsonPath.read(dashboard, "$.despesasPorCategoria[*].participacao");
        List<String> dias = JsonPath.read(dashboard, "$.despesasAcumuladasPorDia[*].data");
        List<Number> valoresDiarios = JsonPath.read(dashboard, "$.despesasAcumuladasPorDia[*].valorDia");
        List<Number> acumulados = JsonPath.read(dashboard, "$.despesasAcumuladasPorDia[*].acumulado");

        assertThat(nomes).as("a maior vem primeiro")
                .containsExactly("Combustivel categoria", "Manutencao categoria");
        assertThat(valores.get(0).doubleValue()).as("as duas de combustivel somam numa linha").isEqualTo(800.0);
        assertThat(valores.get(1).doubleValue()).isEqualTo(200.0);
        assertThat(participacoes.get(0).doubleValue()).as("800 de 1000 pagos").isEqualTo(80.0);
        assertThat(participacoes.get(1).doubleValue()).isEqualTo(20.0);

        // A soma das categorias tem de fechar com o numero grande da tela.
        Number pagas = JsonPath.read(dashboard, "$.despesasPagas");
        assertThat(pagas.doubleValue()).as("a despesa nao paga nao entra em lugar nenhum").isEqualTo(1000.0);
        assertThat(dias).as("a serie usa o dia do pagamento e vem em ordem")
                .containsExactly("2044-03-05", "2044-03-07");
        assertThat(valoresDiarios.stream().map(Number::doubleValue).toList())
                .as("despesas do mesmo dia sao agrupadas")
                .containsExactly(800.0, 200.0);
        assertThat(acumulados.stream().map(Number::doubleValue).toList())
                .containsExactly(800.0, 1000.0);
        assertThat(acumulados.get(acumulados.size() - 1).doubleValue())
                .as("o ultimo acumulado fecha com despesasPagas")
                .isEqualTo(pagas.doubleValue());
    }

    @Test
    void periodoSemDespesaPagaDevolveListaVaziaEmVezDeErro() throws Exception {
        String token = login();
        String dashboard = mvc.perform(get("/api/dashboard").header("Authorization", "Bearer " + token)
                        .param("inicio", "2055-01-01").param("fim", "2055-01-31"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        List<Object> categorias = JsonPath.read(dashboard, "$.despesasPorCategoria");
        List<Object> acumuladas = JsonPath.read(dashboard, "$.despesasAcumuladasPorDia");
        assertThat(categorias).isEmpty();
        assertThat(acumuladas).isEmpty();
    }

    private String despesa(String token, String descricao, long categoria, String valor, String data) throws Exception {
        return despesa(token, descricao, categoria, valor, data, data);
    }

    private String despesa(String token, String descricao, long categoria, String valor, String data,
                           String dataPagamento) throws Exception {
        return criar(token, "/api/despesas", """
                {"descricao":"%s","categoriaId":%d,"valor":%s,"data":"%s","dataPagamento":"%s","status":"PAGO"}
                """.formatted(descricao, categoria, valor, data, dataPagamento));
    }

    private void aprovar(String token, long despesaId) throws Exception {
        mvc.perform(patch("/api/despesas/{id}/aprovar", despesaId).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
    }

    private String login() throws Exception {
        String json = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"admin@fluxogestao.local","senha":"Admin@123"}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.usuario.perfil").value("ADMINISTRADOR"))
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(json, "$.token");
    }

    private String criar(String token, String path, String body) throws Exception {
        return mvc.perform(post(path).header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
    }

    private long id(String json) { return ((Number) JsonPath.read(json, "$.id")).longValue(); }
}
