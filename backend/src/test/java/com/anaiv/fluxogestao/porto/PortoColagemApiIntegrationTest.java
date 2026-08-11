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
    void importaBlocosAguardandoLancamentoSoDepoisDaConfirmacao() throws Exception {
        String token=login();
        String conteudo="""
            01/0000099-26
            PRESTADOR SINTÉTICO
            31/07/2026 10:30
            PORTO SEGURO CIA DE SEGUROS GERAIS
            GUINCHO
            CLIENTE SINTÉTICO
            ABC1D23
            R$ 181,00
            Aguardando Lançamento
            """;
        String resposta=mvc.perform(post("/api/porto/importacoes/previa-conteudo")
                .header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("conteudo",conteudo))))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.tipo").value("SERVICOS_AGUARDANDO_LANCAMENTO"))
            .andExpect(jsonPath("$.resumo.registrosNovos").value(1))
            .andReturn().getResponse().getContentAsString();

        mvc.perform(get("/api/porto/ordens-servico").header("Authorization","Bearer "+token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[?(@.numero == '01/0000099-26')]").isEmpty());

        long id=((Number)JsonPath.read(resposta,"$.id")).longValue();
        confirmar(token,id);
        mvc.perform(get("/api/porto/ordens-servico").param("numeroOs","01/0000099-26")
                .header("Authorization","Bearer "+token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].statusOperacional").value("AGUARDANDO_LANCAMENTO"))
            .andExpect(jsonPath("$[0].statusFinanceiro").value("AGUARDANDO_OP"))
            .andExpect(jsonPath("$[0].dataPrevistaOriginal").value("2026-08-14"))
            .andExpect(jsonPath("$[0].dataHoraAtendimento").value(org.hamcrest.Matchers.startsWith("2026-07-31T10:30")))
            .andExpect(jsonPath("$[0].ordemPagamento").doesNotExist());
    }

    @Test
    void reimportacaoCompletaVaziosEPreservaValorEmConflito() throws Exception {
        String token=login();
        String base="""
            01/0000098-26
            PRESTADOR SINTÉTICO
            31/07/2026 10:30
            PORTO SEGURO CIA DE SEGUROS GERAIS
            GUINCHO
            CLIENTE SINTÉTICO
            ABC1D23
            R$ 181,00
            Aguardando Lançamento
            """;
        long primeira=((Number)JsonPath.read(previaConteudo(token,base),"$.id")).longValue();confirmar(token,primeira);

        String completa=base.replace("R$ 181,00","123.456\nSOCORRISTA SINTÉTICO\nR$ 181,00");
        String previaCompleta=previaConteudo(token,completa);
        org.assertj.core.api.Assertions.assertThat((String)JsonPath.read(previaCompleta,"$.linhas[0].acao")).isEqualTo("ATUALIZAR");
        confirmar(token,((Number)JsonPath.read(previaCompleta,"$.id")).longValue());
        mvc.perform(get("/api/porto/ordens-servico").param("numeroOs","01/0000098-26").header("Authorization","Bearer "+token))
            .andExpect(status().isOk()).andExpect(jsonPath("$[0].qra").value("123.456"))
            .andExpect(jsonPath("$[0].socorrista").value("SOCORRISTA SINTÉTICO"));

        String divergente=previaConteudo(token,completa.replace("R$ 181,00","R$ 999,00"));
        long divergenteId=((Number)JsonPath.read(divergente,"$.id")).longValue();
        org.assertj.core.api.Assertions.assertThat((String)JsonPath.read(divergente,"$.linhas[0].acao")).isEqualTo("DIVERGENCIA");
        mvc.perform(post("/api/porto/importacoes/{id}/confirmar",divergenteId).header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isBadRequest());
        mvc.perform(get("/api/porto/ordens-servico").param("numeroOs","01/0000098-26").header("Authorization","Bearer "+token))
            .andExpect(status().isOk()).andExpect(jsonPath("$[0].valorTotal").value(181.0));
    }

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
            .andExpect(jsonPath("$.requerOrdemPagamento").value(true))
            .andExpect(jsonPath("$.totalLinhas").value(2))
            .andExpect(jsonPath("$.resumo.registrosNovos").value(2))
            .andExpect(jsonPath("$.resumo.valorTotal").value(300.75))
            .andReturn().getResponse().getContentAsString();

        mvc.perform(get("/api/porto/ordens-servico").header("Authorization","Bearer "+token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[?(@.numero == 'OS 01/0000001-26')]").isEmpty());

        long id=((Number)JsonPath.read(previa,"$.id")).longValue();
        long op=criarOp(token,"OP-COLAGEM-GERAL-PAGA",300.75,"2026-08-14");
        long calendario=calendarioId(token,"2026-08-14");
        mvc.perform(post("/api/porto/importacoes/{id}/confirmar",id)
                .header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON)
                .content("{\"ordemPagamentoId\":"+op+",\"calendarioPagamentoId\":"+calendario+"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.novos").value(2));

        mvc.perform(get("/api/porto/ordens-servico").header("Authorization","Bearer "+token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[?(@.numero == 'OS 01/0000001-26')].statusOperacional").value("PROCESSADO"))
            .andExpect(jsonPath("$[?(@.numero == 'OS 01/0000001-26')].statusFinanceiro").value("RECEBIDO"))
            .andExpect(jsonPath("$[?(@.numero == 'OS 01/0000001-26')].ordemPagamento").value("OP-COLAGEM-GERAL-PAGA"))
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

    private String previaConteudo(String token,String conteudo) throws Exception {
        return mvc.perform(post("/api/porto/importacoes/previa-conteudo").header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("conteudo",conteudo))))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
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

    private long criarOp(String token,String numero,double valor,String data) throws Exception {
        String resposta=mvc.perform(post("/api/porto/ordens-pagamento").header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"numero\":\""+numero+"\",\"dataPrevista\":\""+data+"\",\"valorInformado\":"+valor+",\"statusPorto\":\"PROCESSADO\",\"situacaoFinanceira\":\"PROGRAMADO\",\"pagamentoConfirmado\":false}"))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return ((Number)JsonPath.read(resposta,"$.id")).longValue();
    }

    private long calendarioId(String token,String dataPagamento) throws Exception {
        String resposta=mvc.perform(get("/api/porto/calendario").header("Authorization","Bearer "+token))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        java.util.List<Map<String,Object>> encontrados=JsonPath.read(resposta,"$[?(@.dataPagamento == '"+dataPagamento+"')]");
        return ((Number)encontrados.getFirst().get("id")).longValue();
    }

    private String login() throws Exception {
        String resposta=mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"admin@fluxogestao.local\",\"senha\":\"Admin@123\"}"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(resposta,"$.token");
    }
}
