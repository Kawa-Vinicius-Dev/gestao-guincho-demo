package com.anaiv.fluxogestao.financeiro;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class FluxoFinanceiroApiIntegrationTest {

    @Autowired MockMvc mvc;

    @Test
    void extratoDashboardEDreCompartilhamSomenteMovimentosReais() throws Exception {
        String token = login();
        long categoriaReceita = id(criar(token, "/api/categorias", """
                {"nome":"Receita arquitetura real","tipo":"RECEITA"}
                """));
        long categoriaDespesa = id(criar(token, "/api/categorias", """
                {"nome":"Despesa arquitetura real","tipo":"DESPESA"}
                """));

        criar(token, "/api/receitas", """
                {"descricao":"Receita recebida arquitetura","categoriaId":%d,"valor":300.00,
                 "dataCompetencia":"2035-05-10","dataRecebimento":"2035-05-12","status":"RECEBIDA","recorrente":false}
                """.formatted(categoriaReceita));
        criar(token, "/api/receitas", """
                {"descricao":"Receita prevista arquitetura","categoriaId":%d,"valor":700.00,
                 "dataCompetencia":"2035-05-15","status":"PREVISTA","recorrente":false}
                """.formatted(categoriaReceita));

        long despesaPaga = id(criar(token, "/api/despesas", """
                {"descricao":"Despesa paga arquitetura","categoriaId":%d,"valor":100.00,
                 "data":"2035-05-13","dataPagamento":"2035-05-13","status":"PAGO"}
                """.formatted(categoriaDespesa)));
        mvc.perform(patch("/api/despesas/{id}/aprovar", despesaPaga).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());

        long despesaPrevista = id(criar(token, "/api/despesas", """
                {"descricao":"Despesa prevista arquitetura","categoriaId":%d,"valor":80.00,
                 "data":"2035-05-14","vencimento":"2035-05-20","status":"PENDENTE"}
                """.formatted(categoriaDespesa)));
        mvc.perform(patch("/api/despesas/{id}/aprovar", despesaPrevista).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());

        mvc.perform(get("/api/dashboard").header("Authorization", "Bearer " + token)
                        .param("inicio", "2035-05-01").param("fim", "2035-05-31"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.receitaRecebida").value(300.0))
                .andExpect(jsonPath("$.receitaPrevista").value(700.0))
                .andExpect(jsonPath("$.despesasPagas").value(100.0))
                .andExpect(jsonPath("$.despesasPrevistas").value(80.0))
                .andExpect(jsonPath("$.saldoRealizado").value(200.0));

        mvc.perform(get("/api/lancamentos").header("Authorization", "Bearer " + token)
                        .param("inicio", "2035-05-01").param("fim", "2035-05-31"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.descricao == 'Receita recebida arquitetura')].realizado").value(true))
                .andExpect(jsonPath("$[?(@.descricao == 'Receita prevista arquitetura')].realizado").value(false))
                .andExpect(jsonPath("$[?(@.descricao == 'Despesa paga arquitetura')].realizado").value(true))
                .andExpect(jsonPath("$[?(@.descricao == 'Despesa prevista arquitetura')].realizado").value(false));

        mvc.perform(patch("/api/despesas/{id}/pagar", despesaPrevista)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"dataPagamento":"2035-05-25","formaPagamento":"PIX"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PAGO"))
                .andExpect(jsonPath("$.dataPagamento").value("2035-05-25"));

        mvc.perform(get("/api/dashboard").header("Authorization", "Bearer " + token)
                        .param("inicio", "2035-05-01").param("fim", "2035-05-31"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.despesasPagas").value(180.0))
                .andExpect(jsonPath("$.despesasPrevistas").value(0.0))
                .andExpect(jsonPath("$.saldoRealizado").value(120.0));
    }

    @Test
    void administradorControlaFluxoFinanceiroEQuilometragem() throws Exception {
        String token = login();

        long veiculoId = id(criar(token, "/api/veiculos", """
                {"identificacao":"Guincho 01","placa":"ABC1D23","modelo":"Daily","custoPorKm":2.50}
                """));
        long contratanteId = id(criar(token, "/api/contratantes", """
                {"nome":"Porto Seguro","documento":"61.198.164/0001-60"}
                """));
        long categoriaId = id(criar(token, "/api/categorias", """
                {"nome":"Diesel operacional","tipo":"DESPESA"}
                """));

        long contaId = id(criar(token, "/api/contas-receber", """
                {"contratanteId":%d,"protocolo":"PS-1001","descricao":"Remoção segurado",
                 "valorPrevisto":800.00,"dataCompetencia":"2026-07-20","vencimento":"2026-07-22",
                 "veiculoId":%d,"origem":"MANUAL"}
                """.formatted(contratanteId, veiculoId)));

        mvc.perform(patch("/api/contas-receber/{id}/receber", contaId)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"valorRecebido":780.00,"dataRecebimento":"2026-07-23"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("RECEBIDO"))
                .andExpect(jsonPath("$.diferenca").value(-20.0));

        long despesaId = id(criar(token, "/api/despesas", """
                {"descricao":"Abastecimento","categoriaId":%d,"valor":200.00,"data":"2026-07-23",
                 "dataPagamento":"2026-07-23","formaPagamento":"PIX","veiculoId":%d,"status":"PAGO"}
                """.formatted(categoriaId, veiculoId)));

        mvc.perform(patch("/api/despesas/{id}/aprovar", despesaId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.aprovada").value(true));

        criar(token, "/api/quilometragens", """
                {"data":"2026-07-23","veiculoId":%d,"hodometroInicial":1000,
                 "hodometroFinal":1100,"quilometragemRemunerada":70}
                """.formatted(veiculoId));

        mvc.perform(get("/api/dashboard")
                        .header("Authorization", "Bearer " + token)
                        .param("inicio", "2026-07-01")
                        .param("fim", "2026-07-31"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.receitaRecebida").value(780.0))
                .andExpect(jsonPath("$.despesasPagas").value(200.0))
                .andExpect(jsonPath("$.saldoRealizado").value(580.0))
                .andExpect(jsonPath("$.quilometragemTotal").value(100.0))
                .andExpect(jsonPath("$.kmMorto").value(30.0))
                .andExpect(jsonPath("$.custoKmMorto").value(75.0));
    }

    @Test
    void rotasFinanceirasExigemAutenticacaoEValidamQuilometragem() throws Exception {
        mvc.perform(get("/api/dashboard")).andExpect(status().isUnauthorized());

        String token = login();
        long veiculoId = id(criar(token, "/api/veiculos", """
                {"identificacao":"Guincho validação","placa":"XYZ9Z99","custoPorKm":2.00}
                """));

        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/quilometragens")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"data":"2026-07-23","veiculoId":%d,"hodometroInicial":2000,
                                 "hodometroFinal":1900,"quilometragemRemunerada":10}
                                """.formatted(veiculoId)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detalhe").value("O hodômetro final não pode ser menor que o inicial."));
    }

    @Test
    void funcionarioRegistraDespesaMasNaoAcessaVisaoFinanceiraNemAprova() throws Exception {
        String admin = login();
        criar(admin, "/api/usuarios", """
                {"nome":"Motorista Teste","email":"motorista@fluxogestao.local",
                 "senha":"Motorista@123","perfil":"FUNCIONARIO"}
                """);
        String resposta = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"motorista@fluxogestao.local\",\"senha\":\"Motorista@123\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.usuario.perfil").value("FUNCIONARIO"))
                .andReturn().getResponse().getContentAsString();
        String funcionario = JsonPath.read(resposta, "$.token");

        mvc.perform(get("/api/dashboard").header("Authorization", "Bearer " + funcionario)
                        .param("inicio", "2026-07-01").param("fim", "2026-07-31"))
                .andExpect(status().isForbidden());

        String despesa = criar(funcionario, "/api/despesas", """
                {"descricao":"Pedágio do motorista","categoriaId":1,"valor":35.00,
                 "data":"2026-07-23","status":"PAGO"}
                """);
        long despesaId = id(despesa);

        mvc.perform(patch("/api/despesas/{id}/aprovar", despesaId)
                        .header("Authorization", "Bearer " + funcionario))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/despesas").header("Authorization", "Bearer " + funcionario))
                .andExpect(status().isForbidden());
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
