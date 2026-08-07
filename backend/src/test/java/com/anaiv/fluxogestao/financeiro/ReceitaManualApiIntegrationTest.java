package com.anaiv.fluxogestao.financeiro;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ReceitaManualApiIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    @Test
    void editaEExcluiReceitaManualSemDuplicarERecalculaDashboard() throws Exception {
        String token=login();double antes=receitaDashboard(token);long categoria=id(criar(token,"/api/categorias","{\"nome\":\"Receita manual teste\",\"tipo\":\"RECEITA\"}"));
        long receita=id(criar(token,"/api/receitas","{\"descricao\":\"Receita editável\",\"categoriaId\":"+categoria+",\"valor\":100,\"dataCompetencia\":\"2026-12-01\",\"dataRecebimento\":\"2026-12-01\",\"status\":\"RECEBIDA\",\"recorrente\":false}"));

        mvc.perform(put("/api/receitas/{id}",receita).header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON)
                .content("{\"descricao\":\"Receita alterada\",\"categoriaId\":"+categoria+",\"valor\":175,\"dataCompetencia\":\"2026-12-01\",\"dataRecebimento\":\"2026-12-02\",\"status\":\"RECEBIDA\",\"recorrente\":false}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.valor").value(175d)).andExpect(jsonPath("$.manual").value(true));
        assertThat(jdbc.queryForObject("select count(*) from receitas where id=?",Integer.class,receita)).isOne();
        assertThat(receitaDashboard(token)).isEqualTo(antes+175d);

        mvc.perform(delete("/api/receitas/{id}",receita).header("Authorization","Bearer "+token)).andExpect(status().isNoContent());
        assertThat(jdbc.queryForObject("select count(*) from receitas where id=?",Integer.class,receita)).isZero();
        assertThat(receitaDashboard(token)).isEqualTo(antes);
    }

    @Test
    void funcionarioNaoPodeEditarNemExcluirReceitaManual() throws Exception {
        String admin=login();long categoria=id(criar(admin,"/api/categorias","{\"nome\":\"Receita protegida por perfil\",\"tipo\":\"RECEITA\"}"));
        long receita=id(criar(admin,"/api/receitas","{\"descricao\":\"Receita do administrador\",\"categoriaId\":"+categoria+",\"valor\":80,\"dataCompetencia\":\"2032-01-01\",\"dataRecebimento\":\"2032-01-01\",\"status\":\"RECEBIDA\",\"recorrente\":false}"));
        criar(admin,"/api/usuarios","{\"nome\":\"Funcionário sem permissão\",\"email\":\"receita.funcionario@local.test\",\"senha\":\"Funcionario@123\",\"perfil\":\"FUNCIONARIO\"}");
        String funcionario=login("receita.funcionario@local.test","Funcionario@123");

        mvc.perform(put("/api/receitas/{id}",receita).header("Authorization","Bearer "+funcionario).contentType(MediaType.APPLICATION_JSON)
                .content("{\"descricao\":\"Tentativa\",\"categoriaId\":"+categoria+",\"valor\":1,\"dataCompetencia\":\"2032-01-01\",\"status\":\"RECEBIDA\",\"recorrente\":false}"))
            .andExpect(status().isForbidden());
        mvc.perform(delete("/api/receitas/{id}",receita).header("Authorization","Bearer "+funcionario)).andExpect(status().isForbidden());
        assertThat(jdbc.queryForObject("select count(*) from receitas where id=?",Integer.class,receita)).isOne();
    }

    @Test
    void rejeitaAlteracaoEExclusaoDeReceitaPorto() throws Exception {
        String token=login();long receita=criarReceitaPorto(token);
        mvc.perform(put("/api/receitas/{id}",receita).header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON)
                .content("{\"descricao\":\"Tentativa\",\"valor\":1,\"dataCompetencia\":\"2026-01-01\",\"status\":\"RECEBIDA\",\"recorrente\":false}"))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detalhe").value(org.hamcrest.Matchers.containsString("Porto")));
        mvc.perform(delete("/api/receitas/{id}",receita).header("Authorization","Bearer "+token))
            .andExpect(status().isBadRequest());
    }

    private String criar(String token,String caminho,String corpo) throws Exception {return mvc.perform(post(caminho).header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON).content(corpo)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();}
    private long criarReceitaPorto(String token) throws Exception {
        long calendario=id(criar(token,"/api/porto/calendario","{\"dataPagamento\":\"2031-02-15\",\"competenciaInicio\":\"2031-02-01\",\"competenciaFim\":\"2031-02-28\",\"descricao\":\"Teste receita protegida\",\"ativo\":true}"));
        long op=id(criar(token,"/api/porto/ordens-pagamento","{\"numero\":\"OP-RECEITA-PROTEGIDA\",\"dataPrevista\":\"2031-02-15\",\"valorInformado\":100,\"statusPorto\":\"PROCESSADO\",\"situacaoFinanceira\":\"PROGRAMADO\",\"pagamentoConfirmado\":false}"));
        String csv="Número da Ordem de Serviço\tValor Total\tEspecialidade\tSigla da Viatura\tSocorrista\tQRA\tData de atendimento\nOS-RECEITA-PROTEGIDA\t100,00\tGUINCHO\t\t\t\t01/01/2031\n";
        MockMultipartFile arquivo=new MockMultipartFile("arquivo","receita-protegida.txt","text/plain",csv.getBytes(StandardCharsets.UTF_8));
        String previa=mvc.perform(multipart("/api/porto/ordens-pagamento/{id}/composicao/previa",op).file(arquivo).header("Authorization","Bearer "+token))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        long importacao=id(previa);
        mvc.perform(post("/api/porto/importacoes/{id}/confirmar",importacao).header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON)
                .content("{\"ordemPagamentoId\":"+op+",\"calendarioPagamentoId\":"+calendario+"}"))
            .andExpect(status().isOk());
        return jdbc.queryForObject("select id from receitas where ordem_pagamento_porto_id=?",Long.class,op);
    }
    private long id(String json){return ((Number)JsonPath.read(json,"$.id")).longValue();}
    private double receitaDashboard(String token) throws Exception {String json=mvc.perform(get("/api/dashboard").header("Authorization","Bearer "+token).param("inicio","2026-12-01").param("fim","2026-12-31")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();return ((Number)JsonPath.read(json,"$.receitaRecebida")).doubleValue();}
    private String login() throws Exception {return login("admin@fluxogestao.local","Admin@123");}
    private String login(String email,String senha) throws Exception {String json=mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\""+email+"\",\"senha\":\""+senha+"\"}")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();return JsonPath.read(json,"$.token");}
}
