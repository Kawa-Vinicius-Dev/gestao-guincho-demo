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

import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * A extensao do arquivo decide o separador usado na leitura, entao .tsv precisa ser tratado como
 * tabulado. E, como a associacao passou a ser feita so pelo QRA, a confirmacao precisa dizer quais
 * OS ficaram sem socorrista para o operacional resolver.
 */
@SpringBootTest @AutoConfigureMockMvc @ActiveProfiles("test")
class PortoImportacaoExcecoesApiIntegrationTest {
    @Autowired MockMvc mvc;

    @Test void aceitaTsvTabuladoERelataAsOsQueFicaramSemSocorrista() throws Exception {
        String token=login();
        criar(token,"/api/motoristas","{\"nome\":\"SOCORRISTA COM QRA\",\"qra\":\"880001\"}");
        long calendario=((Number)JsonPath.read(criar(token,"/api/porto/calendario",
            "{\"dataPagamento\":\"2072-09-16\",\"competenciaInicio\":\"2072-08-16\",\"competenciaFim\":\"2072-08-31\",\"descricao\":\"Ciclo excecoes\",\"ativo\":true}"),"$.id")).longValue();

        // arquivo tabulado com extensao .tsv, como sai do sistema da Porto
        MockMultipartFile arquivo=new MockMultipartFile("arquivo","relatorio-porto.tsv","text/plain",("""
            Número da Ordem de Serviço\tValor Total\tEspecialidade\tSigla da Viatura\tSocorrista\tQRA\tData de atendimento
            OS-EXC-COM-QRA\t100.00\tGUINCHO\t\tSOCORRISTA COM QRA\t880001\t20/08/2072
            OS-EXC-QRA-DESCONHECIDO\t200.00\tGUINCHO\t\tOUTRO SOCORRISTA\t889999\t21/08/2072
            OS-EXC-SEM-QRA\t300.00\tGUINCHO\t\t\t\t22/08/2072
            """).getBytes(StandardCharsets.UTF_8));
        String previa=mvc.perform(multipart("/api/porto/importacoes/previa").file(arquivo).header("Authorization","Bearer "+token))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.tipo").value("SERVICOS_GERAIS"))
            .andExpect(jsonPath("$.totalLinhas").value(3))
            .andReturn().getResponse().getContentAsString();

        // a previa antecipa a unica excecao real: linha com QRA ganha cadastro na confirmacao
        List<String> avisoPrevia=JsonPath.read(previa,"$.osSemSocorrista");
        assertThat(avisoPrevia).containsExactly("OS-EXC-SEM-QRA");

        String confirmacao=mvc.perform(post("/api/porto/importacoes/{id}/confirmar",((Number)JsonPath.read(previa,"$.id")).longValue())
                .header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON)
                .content("{\"numeroOrdemPagamento\":\"OP-EXCECOES\",\"calendarioPagamentoId\":"+calendario
                    +",\"confirmarDivergencias\":true,\"confirmarReassociacoes\":true}"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();

        assertThat((Integer)JsonPath.read(confirmacao,"$.importados")).isEqualTo(3);
        List<String> semSocorrista=JsonPath.read(confirmacao,"$.osSemSocorrista");
        assertThat(semSocorrista).containsExactly("OS-EXC-SEM-QRA");
    }

    @Test void recusaExtensaoQueNaoSabeLer() throws Exception {
        MockMultipartFile planilha=new MockMultipartFile("arquivo","relatorio.xlsx","application/vnd.ms-excel","qualquer".getBytes(StandardCharsets.UTF_8));
        mvc.perform(multipart("/api/porto/importacoes/previa").file(planilha).header("Authorization","Bearer "+login()))
            .andExpect(status().isBadRequest());
    }

    private String criar(String token,String caminho,String corpo) throws Exception {
        return mvc.perform(post(caminho).header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON).content(corpo))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
    }
    private String login() throws Exception {
        return JsonPath.read(mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
            .content("{\"email\":\"admin@fluxogestao.local\",\"senha\":\"Admin@123\"}"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(),"$.token");
    }
}
