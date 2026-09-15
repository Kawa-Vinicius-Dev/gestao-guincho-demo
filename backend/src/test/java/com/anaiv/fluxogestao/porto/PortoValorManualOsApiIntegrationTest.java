package com.anaiv.fluxogestao.porto;

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

import tools.jackson.databind.ObjectMapper;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * O painel diario entrega servico sem preco: a Porto so precifica quando fecha a
 * OP. Ate la o servico existe, foi prestado, e vale alguma coisa — mas entrava
 * com zero e nao havia como corrigir, entao a producao do dia ficava zerada.
 *
 * O valor informado a mao conta como producao pendente, nunca como receita: o
 * dinheiro so entra no caixa quando a Porto paga. Por isso servico ja pago
 * recusa a edicao — ali o valor oficial e o da OP.
 */
@SpringBootTest @AutoConfigureMockMvc @ActiveProfiles("test")
class PortoValorManualOsApiIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper json;

    @Test void servicoSemPrecoRecebeValorManualEContaComoProducaoPendente() throws Exception {
        String token=login();
        // Painel diario: sem coluna de valor, sem QRA.
        confirmar(token,colar(token,"""
            PORTO SEGURO\t7400001/26\tSOCORRO\tL845
            ANDERSON TESTE\t14/07/2064\t07:00\t07:00\tACIONADO/FINAL\tEM PROCESSAMENTO\tNão
            """));

        long os=osDe("7400001/26");
        assertThat(valorDe(os)).isEqualByComparingTo(BigDecimal.ZERO);

        mvc.perform(patch("/api/porto/ordens-servico/{id}/valor",os).header("Authorization","Bearer "+token)
            .contentType(MediaType.APPLICATION_JSON).content("{\"valorTotal\":181.00}"))
            .andExpect(status().isOk());
        assertThat(valorDe(os)).isEqualByComparingTo(new BigDecimal("181.00"));

        // Producao pendente do dia passa a enxergar o servico; receita nao se mexe.
        String painelDia=mvc.perform(get("/api/dashboard").header("Authorization","Bearer "+token)
            .param("inicio","2064-07-14").param("fim","2064-07-14"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(new BigDecimal(JsonPath.read(painelDia,"$.producaoPendente").toString()))
            .isEqualByComparingTo(new BigDecimal("181.00"));
        assertThat(new BigDecimal(JsonPath.read(painelDia,"$.receitaRecebida").toString()))
            .isEqualByComparingTo(BigDecimal.ZERO);
    }

    @Test void servicoJaPagoPelaPortoRecusaValorManual() throws Exception {
        String token=login();
        long calendario=id(criar(token,"/api/porto/calendario",
            "{\"dataPagamento\":\"2064-08-14\",\"competenciaInicio\":\"2064-07-16\",\"competenciaFim\":\"2064-07-31\",\"descricao\":\"Ciclo valor manual\",\"ativo\":true}"));
        MockMultipartFile op=new MockMultipartFile("arquivo","op.txt","text/plain",("""
            Número da Ordem de Serviço\tValor Total\tEspecialidade\tSigla da Viatura\tSocorrista\tQRA\tData de atendimento
            OS-JA-PAGA\t500.00\tGUINCHO\t\tFULANO\t880001\t20/07/2064
            """).getBytes(StandardCharsets.UTF_8));
        long previa=id(mvc.perform(multipart("/api/porto/importacoes/previa").file(op)
            .header("Authorization","Bearer "+token)).andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString());
        mvc.perform(post("/api/porto/importacoes/{id}/confirmar",previa).header("Authorization","Bearer "+token)
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"numeroOrdemPagamento\":\"OP-VALOR-MANUAL\",\"calendarioPagamentoId\":"+calendario
                +",\"confirmarDivergencias\":true,\"confirmarReassociacoes\":true}")).andExpect(status().isOk());

        long os=osDe("OS-JA-PAGA");
        mvc.perform(patch("/api/porto/ordens-servico/{id}/valor",os).header("Authorization","Bearer "+token)
            .contentType(MediaType.APPLICATION_JSON).content("{\"valorTotal\":1.00}"))
            .andExpect(status().isBadRequest());
        // O valor da OP fica de pe: sobrescrever desencontraria o caixa do extrato da Porto.
        assertThat(valorDe(os)).isEqualByComparingTo(new BigDecimal("500.00"));
    }

    @Test void valorNegativoRecusado() throws Exception {
        String token=login();
        confirmar(token,colar(token,"""
            PORTO SEGURO\t7400002/26\tSOCORRO\tL845
            ANDERSON TESTE\t15/07/2064\t07:00\t07:00\tACIONADO/FINAL\tEM PROCESSAMENTO\tNão
            """));

        mvc.perform(patch("/api/porto/ordens-servico/{id}/valor",osDe("7400002/26"))
            .header("Authorization","Bearer "+token)
            .contentType(MediaType.APPLICATION_JSON).content("{\"valorTotal\":-10.00}"))
            .andExpect(status().isBadRequest());
    }

    private long colar(String token,String conteudo) throws Exception {
        return id(mvc.perform(post("/api/porto/importacoes/previa-conteudo").header("Authorization","Bearer "+token)
            .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("conteudo",conteudo))))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }
    private void confirmar(String token,long previa) throws Exception {
        mvc.perform(post("/api/porto/importacoes/{id}/confirmar",previa).header("Authorization","Bearer "+token)
            .contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isOk());
    }
    private long osDe(String numero){
        return jdbc.queryForObject("select id from ordens_servico_porto where numero=?",Long.class,numero);
    }
    private BigDecimal valorDe(long id){
        return jdbc.queryForObject("select valor_total from ordens_servico_porto where id=?",BigDecimal.class,id);
    }
    private long id(String json){ return ((Number)JsonPath.read(json,"$.id")).longValue(); }
    private String criar(String token,String caminho,String corpo) throws Exception {
        return mvc.perform(post(caminho).header("Authorization","Bearer "+token)
            .contentType(MediaType.APPLICATION_JSON).content(corpo))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
    }
    private String login() throws Exception {
        return JsonPath.read(mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
            .content("{\"email\":\"admin@fluxogestao.local\",\"senha\":\"Admin@123\"}"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(),"$.token");
    }
}
