package com.anaiv.fluxogestao.porto;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.util.Map;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PortoOrdemPagamentoFluxoApiIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;

    @Test
    void vinculaServicoExistenteELiberaAposUmCicloSemDuplicar() throws Exception {
        String token=login();
        long op=criarOp(token,"OP-CICLO-028",181,"2026-08-28","PROGRAMADO");
        long servicos=previaConteudo(token,"""
            01/0000088-26
            PRESTADOR SINTÉTICO
            31/07/2026 10:30
            PORTO SEGURO CIA DE SEGUROS GERAIS
            GUINCHO
            CLIENTE SINTÉTICO
            ABC1D23
            R$ 181,00
            Aguardando Lançamento
            """);
        confirmar(token,servicos,"{}");

        long composicao=previaComposicao(token,op,"composicao-ciclo.txt","""
            Número da Ordem de Serviço	Valor Total	Especialidade	Sigla da Viatura	Socorrista	QRA	Data de atendimento
            01/0000088-26	181,00	GUINCHO				31/07/2026
            """);
        confirmar(token,composicao,"{\"ordemPagamentoId\":"+op+"}");

        mvc.perform(get("/api/porto/ordens-servico").param("numeroOs","01/0000088-26").header("Authorization","Bearer "+token))
            .andExpect(status().isOk()).andExpect(jsonPath("$",hasSize(1)))
            .andExpect(jsonPath("$[0].ordemPagamento").value("OP-CICLO-028"))
            .andExpect(jsonPath("$[0].statusOperacional").value("LIBERADO_APOS_ANALISE"))
            .andExpect(jsonPath("$[0].dataPrevistaOriginal").value("2026-08-14"))
            .andExpect(jsonPath("$[0].dataEfetivaPagamento").value("2026-08-28"))
            .andExpect(jsonPath("$[0].ciclosAtraso").value(1));
    }

    @Test
    void divergenciaDaOpExigeJustificativaERegistraValorEUsuario() throws Exception {
        String token=login();long op=criarOp(token,"OP-DIVERGENTE-MANUAL",500,"2026-09-16","A_CONFIRMAR");
        long composicao=previaComposicao(token,op,"composicao-divergente.txt","""
            Número da Ordem de Serviço	Valor Total	Especialidade	Sigla da Viatura	Socorrista	QRA	Data de atendimento
            OS-DIV-MANUAL-1	450,00	PANE		SOCORRISTA SINTÉTICO		01/08/2026
            """);

        mvc.perform(post("/api/porto/importacoes/{id}/confirmar",composicao).header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"ordemPagamentoId\":"+op+"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.detalhe").value(org.hamcrest.Matchers.containsString("justificativa")));
        confirmar(token,composicao,"""
            {"ordemPagamentoId":%d,"motivoDivergencia":"DESCONTO",
             "justificativaDivergencia":"Ajuste sintético informado para teste"}
            """.formatted(op));

        mvc.perform(get("/api/porto/ordens-pagamento/{id}",op).header("Authorization","Bearer "+token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.ordemPagamento.situacao").value("RECEBIDO"))
            .andExpect(jsonPath("$.justificativas[0].motivo").value("DESCONTO"))
            .andExpect(jsonPath("$.justificativas[0].valorDiferenca").value(50.0))
            .andExpect(jsonPath("$.justificativas[0].usuario").value("Administrador"))
            .andExpect(jsonPath("$.historico").isNotEmpty());
    }

    private long criarOp(String token,String numero,double valor,String data,String situacao) throws Exception {
        String corpo=mvc.perform(post("/api/porto/ordens-pagamento").header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON).content("""
                    {"numero":"%s","dataPrevista":"%s","valorInformado":%.2f,"statusPorto":"PROCESSADO",
                     "situacaoFinanceira":"%s","pagamentoConfirmado":false,"observacao":"Sintético"}
                    """.formatted(numero,data,valor,situacao)))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return ((Number)JsonPath.read(corpo,"$.id")).longValue();
    }
    private long previaConteudo(String token,String conteudo) throws Exception {String corpo=mvc.perform(post("/api/porto/importacoes/previa-conteudo").header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("conteudo",conteudo)))).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();return ((Number)JsonPath.read(corpo,"$.id")).longValue();}
    private long previaComposicao(String token,long op,String nome,String conteudo) throws Exception {MockMultipartFile arquivo=new MockMultipartFile("arquivo",nome,"text/plain",conteudo.getBytes(StandardCharsets.UTF_8));String corpo=mvc.perform(multipart("/api/porto/ordens-pagamento/{id}/composicao/previa",op).file(arquivo).header("Authorization","Bearer "+token)).andExpect(status().isCreated()).andExpect(jsonPath("$.tipo").value("OS_VINCULADAS")).andReturn().getResponse().getContentAsString();return ((Number)JsonPath.read(corpo,"$.id")).longValue();}
    private void confirmar(String token,long id,String corpo) throws Exception {mvc.perform(post("/api/porto/importacoes/{id}/confirmar",id).header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON).content(corpo)).andExpect(status().isOk());}
    private String login() throws Exception {String resposta=mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"admin@fluxogestao.local\",\"senha\":\"Admin@123\"}")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();return JsonPath.read(resposta,"$.token");}
}
