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

import java.util.Map;
import java.nio.charset.StandardCharsets;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PortoColagemApiIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;

    @Test
    void colagemTabuladaSoPersisteAposConfirmacaoEPermiteOpcionaisVazios() throws Exception {
        String token=login();
        String conteudo="""
            Número da Ordem de Serviço\tValor Total\tEspecialidade\tSigla da Viatura\tSocorrista\tQRA\tData de atendimento
            OS 01/0000001-26\t100,50\tREMOÇÃO\t\tSOCORRISTA TESTE\t\t2026-08-01 10:30:00
            OS 01/0000002-26\t200.25\tPANE\tVTR-TESTE\t\tQRA-TESTE-001\t2026-08-01 11:00:00
            """;

        String previa=mvc.perform(post("/api/porto/importacoes/previa-conteudo")
                .header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("conteudo",conteudo))))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.tipo").value("SERVICOS_GERAIS"))
            .andExpect(jsonPath("$.totalLinhas").value(2))
            .andExpect(jsonPath("$.resumo.registrosNovos").value(2))
            .andExpect(jsonPath("$.resumo.valorTotal").value(300.75))
            .andReturn().getResponse().getContentAsString();

        mvc.perform(get("/api/porto/ordens-servico").header("Authorization","Bearer "+token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[?(@.numero == 'OS 01/0000001-26')]").isEmpty());

        long id=((Number)JsonPath.read(previa,"$.id")).longValue();
        mvc.perform(post("/api/porto/importacoes/{id}/confirmar",id)
                .header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.novos").value(2));

        mvc.perform(get("/api/porto/ordens-servico").header("Authorization","Bearer "+token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[?(@.numero == 'OS 01/0000001-26')].statusOperacional").value("NORMAL"))
            .andExpect(jsonPath("$[?(@.numero == 'OS 01/0000001-26')].statusFinanceiro").value("AGUARDANDO_OP"))
            .andExpect(jsonPath("$[?(@.numero == 'OS 01/0000001-26')].ordemPagamento").isEmpty())
            .andExpect(jsonPath("$[?(@.numero == 'OS 01/0000001-26')].viatura").isEmpty())
            .andExpect(jsonPath("$[?(@.numero == 'OS 01/0000002-26')].viatura").value("VTR-TESTE"));
    }

    @Test
    void previsaoContaOpsUnicasEAtualizaSemDuplicar() throws Exception {
        String token=login();
        long inicial=previaArquivo(token,"op-quantidade-inicial.csv","""
            Número da Ordem de Pagamento;Valor Total do Serviço;Nome: Código;Data de Pagamento
            OP-QTD-001;100,00;Sintético: Inicial;15/08/2026
            """);
        confirmar(token,inicial);

        String previa=previaArquivoJson(token,"op-quantidade-atualizada.csv","""
            Número da Ordem de Pagamento;Valor Total do Serviço;Nome: Código;Data de Pagamento
            OP-QTD-001;150,00;Sintético: Atualizado;16/08/2026
            OP-QTD-002;200,00;Sintético: Nova;17/08/2026
            OP-QTD-002;200,00;Sintético: Nova;17/08/2026
            """);
        long id=((Number)JsonPath.read(previa,"$.id")).longValue();
        org.assertj.core.api.Assertions.assertThat((Integer)JsonPath.read(previa,"$.resumo.linhasAnalisadas")).isEqualTo(3);
        org.assertj.core.api.Assertions.assertThat((Integer)JsonPath.read(previa,"$.resumo.opsUnicas")).isEqualTo(2);
        org.assertj.core.api.Assertions.assertThat((Integer)JsonPath.read(previa,"$.resumo.registrosNovos")).isEqualTo(1);
        org.assertj.core.api.Assertions.assertThat((Integer)JsonPath.read(previa,"$.resumo.registrosExistentes")).isEqualTo(1);
        org.assertj.core.api.Assertions.assertThat((Integer)JsonPath.read(previa,"$.resumo.registrosAtualizados")).isEqualTo(1);
        org.assertj.core.api.Assertions.assertThat((Integer)JsonPath.read(previa,"$.resumo.duplicidades")).isEqualTo(1);
        org.assertj.core.api.Assertions.assertThat(((Number)JsonPath.read(previa,"$.resumo.valorTotal")).doubleValue()).isEqualTo(350.0);

        mvc.perform(post("/api/porto/importacoes/{id}/confirmar",id).header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.novos").value(1))
            .andExpect(jsonPath("$.atualizados").value(1))
            .andExpect(jsonPath("$.ignorados").value(1));

        mvc.perform(get("/api/porto/ordens-pagamento").header("Authorization","Bearer "+token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[?(@.numero == 'OP-QTD-001')]").value(org.hamcrest.Matchers.hasSize(1)))
            .andExpect(jsonPath("$[?(@.numero == 'OP-QTD-001')].valorTotal").value(150.0))
            .andExpect(jsonPath("$[?(@.numero == 'OP-QTD-002')]").value(org.hamcrest.Matchers.hasSize(1)));
    }

    private long previaArquivo(String token,String nome,String conteudo) throws Exception {
        return ((Number)JsonPath.read(previaArquivoJson(token,nome,conteudo),"$.id")).longValue();
    }

    private String previaArquivoJson(String token,String nome,String conteudo) throws Exception {
        MockMultipartFile arquivo=new MockMultipartFile("arquivo",nome,"text/csv",conteudo.getBytes(StandardCharsets.UTF_8));
        return mvc.perform(multipart("/api/porto/importacoes/previa").file(arquivo).header("Authorization","Bearer "+token))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
    }

    private void confirmar(String token,long id) throws Exception {
        mvc.perform(post("/api/porto/importacoes/{id}/confirmar",id).header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isOk());
    }

    private String login() throws Exception {
        String resposta=mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"admin@fluxogestao.local\",\"senha\":\"Admin@123\"}"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(resposta,"$.token");
    }
}
