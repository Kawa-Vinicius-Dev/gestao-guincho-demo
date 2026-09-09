package com.anaiv.fluxogestao.financeiro;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Aluguel e seguro caem todo mes e ninguem quer redigitar. O molde fica guardado, o mes e lancado
 * quando o dono manda, e lancar de novo o mesmo mes nao pode duplicar nada.
 */
@SpringBootTest
@AutoConfigureMockMvc @ActiveProfiles("test")
class DespesaRecorrenteApiIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    @AfterEach void limpar(){
        jdbc.update("delete from despesas where descricao in ('Aluguel do pátio','Seguro da frota','Parcela do guincho')");
        jdbc.update("delete from despesas_recorrentes where descricao in ('Aluguel do pátio','Seguro da frota','Parcela do guincho')");
        jdbc.update("delete from categorias where nome='Entrada para teste de molde'");
    }

    @Test void lancaOMesUmaVezSoEDeixaCadaDespesaViverSozinha() throws Exception {
        String token=login();
        long categoria=categoriaDeDespesa();
        long aluguel=id(criar(token,"{\"descricao\":\"Aluguel do pátio\",\"categoriaId\":"+categoria+",\"valor\":2500.00,\"diaVencimento\":10}"));
        criar(token,"{\"descricao\":\"Seguro da frota\",\"categoriaId\":"+categoria+",\"valor\":800.00,\"diaVencimento\":31}");

        String lancamento=mvc.perform(post("/api/despesas-recorrentes/lancamentos").param("mes","2081-02")
                .header("Authorization","Bearer "+token))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.lancadas").value(2))
            .andExpect(jsonPath("$.jaExistiam").value(0))
            .andExpect(jsonPath("$.valorLancado").value(3300.00))
            .andReturn().getResponse().getContentAsString();
        assertThat((String)JsonPath.read(lancamento,"$.mes")).isEqualTo("2081-02");

        // dia 31 num mes de 28 cai no ultimo dia, e nao escapa para marco
        assertThat(vencimentoDe("Seguro da frota")).isEqualTo("2081-02-28");
        assertThat(vencimentoDe("Aluguel do pátio")).isEqualTo("2081-02-10");
        // nasce aprovada e pendente de pagamento: o dono e quem lanca, e o dashboard so conta aprovada
        assertThat(jdbc.queryForObject("select status from despesas where descricao='Aluguel do pátio'",String.class)).isEqualTo("PENDENTE");
        assertThat(jdbc.queryForObject("select aprovada from despesas where descricao='Aluguel do pátio'",Boolean.class)).isTrue();

        // lancar o mesmo mes de novo nao duplica
        mvc.perform(post("/api/despesas-recorrentes/lancamentos").param("mes","2081-02").header("Authorization","Bearer "+token))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.lancadas").value(0))
            .andExpect(jsonPath("$.jaExistiam").value(2));
        assertThat(quantasDespesas("Aluguel do pátio")).isEqualTo(1);

        // o mes seguinte e outro lancamento
        mvc.perform(post("/api/despesas-recorrentes/lancamentos").param("mes","2081-03").header("Authorization","Bearer "+token))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.lancadas").value(2));
        assertThat(quantasDespesas("Aluguel do pátio")).isEqualTo(2);

        // corrigir o molde nao reescreve o que ja foi lancado
        mvc.perform(put("/api/despesas-recorrentes/{id}",aluguel).header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"descricao\":\"Aluguel do pátio\",\"categoriaId\":"+categoria+",\"valor\":2700.00,\"diaVencimento\":10}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.valor").value(2700.00));
        assertThat(jdbc.queryForObject("select max(valor) from despesas where descricao='Aluguel do pátio'",java.math.BigDecimal.class))
            .isEqualByComparingTo("2500.00");
    }

    @Test void moldeDesativadoParaDeLancarESoAceitaCategoriaDeDespesa() throws Exception {
        String token=login();
        long categoria=categoriaDeDespesa();
        long parcela=id(criar(token,"{\"descricao\":\"Parcela do guincho\",\"categoriaId\":"+categoria+",\"valor\":1500.00,\"diaVencimento\":5}"));

        mvc.perform(patch("/api/despesas-recorrentes/{id}/desativar",parcela).header("Authorization","Bearer "+token))
            .andExpect(status().isOk()).andExpect(jsonPath("$.ativo").value(false));
        mvc.perform(post("/api/despesas-recorrentes/lancamentos").param("mes","2082-05").header("Authorization","Bearer "+token))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.lancadas").value(0));
        assertThat(quantasDespesas("Parcela do guincho")).isZero();

        // desativar nao apaga o molde, e reativar devolve o lancamento
        mvc.perform(patch("/api/despesas-recorrentes/{id}/reativar",parcela).header("Authorization","Bearer "+token))
            .andExpect(status().isOk()).andExpect(jsonPath("$.ativo").value(true));
        mvc.perform(post("/api/despesas-recorrentes/lancamentos").param("mes","2082-05").header("Authorization","Bearer "+token))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.lancadas").value(1));

        // a base de teste pode nao ter categoria de receita ainda: a de guincho nasce sob demanda
        long receita=id(mvc.perform(post("/api/categorias").header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"nome\":\"Entrada para teste de molde\",\"tipo\":\"RECEITA\"}"))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        mvc.perform(post("/api/despesas-recorrentes").header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"descricao\":\"Categoria errada\",\"categoriaId\":"+receita+",\"valor\":10.00,\"diaVencimento\":1}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.detalhe").value("Selecione uma categoria de despesa."));
    }

    private String vencimentoDe(String descricao){
        return String.valueOf(jdbc.queryForObject("select min(vencimento) from despesas where descricao=?",java.sql.Date.class,descricao));
    }
    private int quantasDespesas(String descricao){
        return jdbc.queryForObject("select count(*) from despesas where descricao=?",Integer.class,descricao);
    }
    private long categoriaDeDespesa(){
        return jdbc.queryForObject("select id from categorias where tipo='DESPESA' order by id limit 1",Long.class);
    }
    private long id(String json){ return ((Number)JsonPath.read(json,"$.id")).longValue(); }
    private String criar(String token,String corpo) throws Exception {
        return mvc.perform(post("/api/despesas-recorrentes").header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON).content(corpo))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
    }
    private String login() throws Exception {
        String corpo=mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"admin@fluxogestao.local\",\"senha\":\"Admin@123\"}"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(corpo,"$.token");
    }
}
