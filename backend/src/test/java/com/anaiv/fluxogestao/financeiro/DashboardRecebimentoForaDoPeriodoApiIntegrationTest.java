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

import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * A Porto fecha a OP e paga semanas depois: o servico e de julho, o dinheiro
 * entra em agosto. Quem importa o relatorio e olha o mes do servico ve receita
 * zero e conclui que a importacao falhou — aconteceu tres vezes na operacao.
 *
 * O dashboard passa a dizer para onde o dinheiro foi, em vez de so nao mostra-lo.
 */
@SpringBootTest @AutoConfigureMockMvc @ActiveProfiles("test")
class DashboardRecebimentoForaDoPeriodoApiIntegrationTest {
    @Autowired MockMvc mvc;

    @Test void dizOndeCaiuODinheiroDosServicosPagosForaDaJanela() throws Exception {
        String token=login();
        // Competencia 16-31/07; a Porto paga em 14/08.
        long calendario=id(criar(token,"/api/porto/calendario",
            "{\"dataPagamento\":\"2068-08-14\",\"competenciaInicio\":\"2068-07-16\",\"competenciaFim\":\"2068-07-31\",\"descricao\":\"Ciclo fora da janela\",\"ativo\":true}"));
        MockMultipartFile arquivo=new MockMultipartFile("arquivo","fora.txt","text/plain",("""
            Número da Ordem de Serviço\tValor Total\tEspecialidade\tSigla da Viatura\tSocorrista\tQRA\tData de atendimento
            OS-FORA-1\t300.00\tGUINCHO\t\tFULANO\t680001\t20/07/2068
            OS-FORA-2\t200.00\tGUINCHO\t\tFULANO\t680001\t21/07/2068
            """).getBytes(StandardCharsets.UTF_8));
        long previa=id(mvc.perform(multipart("/api/porto/importacoes/previa").file(arquivo)
            .header("Authorization","Bearer "+token)).andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString());
        mvc.perform(post("/api/porto/importacoes/{id}/confirmar",previa).header("Authorization","Bearer "+token)
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"numeroOrdemPagamento\":\"OP-FORA-JANELA\",\"calendarioPagamentoId\":"+calendario
                +",\"confirmarDivergencias\":true,\"confirmarReassociacoes\":true}")).andExpect(status().isOk());

        // Julho: os servicos aconteceram aqui, mas o dinheiro nao entrou aqui.
        String julho=dashboard(token,"2068-07-01","2068-07-31");
        assertThat(new java.math.BigDecimal(JsonPath.read(julho,"$.receitaRecebida").toString()))
            .isEqualByComparingTo(java.math.BigDecimal.ZERO);
        List<?> avisos=JsonPath.read(julho,"$.recebimentosForaDoPeriodo");
        assertThat(avisos).hasSize(1);
        assertThat(JsonPath.read(julho,"$.recebimentosForaDoPeriodo[0].dataPagamento").toString())
            .isEqualTo("2068-08-14");
        assertThat(new java.math.BigDecimal(
            JsonPath.read(julho,"$.recebimentosForaDoPeriodo[0].valor").toString()))
            .isEqualByComparingTo(new java.math.BigDecimal("500.00"));
        assertThat(((Number)JsonPath.read(julho,"$.recebimentosForaDoPeriodo[0].servicos")).intValue())
            .isEqualTo(2);

        // Agosto: aqui o dinheiro aparece, e nao ha nada para avisar.
        String agosto=dashboard(token,"2068-08-01","2068-08-31");
        assertThat(new java.math.BigDecimal(JsonPath.read(agosto,"$.receitaRecebida").toString()))
            .isEqualByComparingTo(new java.math.BigDecimal("500.00"));
        assertThat((List<?>)JsonPath.read(agosto,"$.recebimentosForaDoPeriodo")).isEmpty();
    }

    private String dashboard(String token,String inicio,String fim) throws Exception {
        return mvc.perform(get("/api/dashboard").header("Authorization","Bearer "+token)
            .param("inicio",inicio).param("fim",fim))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
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
