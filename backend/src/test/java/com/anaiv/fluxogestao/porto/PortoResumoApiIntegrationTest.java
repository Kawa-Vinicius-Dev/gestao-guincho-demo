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
import java.util.Map;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PortoResumoApiIntegrationTest {
    @Autowired MockMvc mvc;

    @Test
    void quantificaOpsUnicasPorConciliacaoRecebimentoEVencimentoERecalculaFiltros() throws Exception {
        String token=login();
        confirmar(token,previa(token,"ops-metricas.csv","""
            Número da Ordem de Pagamento;Valor Total do Serviço;Nome: Código;Data de Pagamento
            OP-MET-A;100,00;Sintético: Sem composição;31/12/2099
            OP-MET-B;200,00;Sintético: Conciliada;31/12/2099
            OP-MET-C;300,00;Sintético: Abaixo;01/01/2026
            OP-MET-D;400,00;Sintético: Acima;31/12/2099
            """),"{}");

        Map<String,Long> ids=idsDasOps(token);
        importarOs(token,"os-metrica-b.csv","OS-MET-B",200,ids.get("OP-MET-B"));
        importarOs(token,"os-metrica-c.csv","OS-MET-C",250,ids.get("OP-MET-C"));
        importarOs(token,"os-metrica-d.csv","OS-MET-D",450,ids.get("OP-MET-D"));
        mvc.perform(patch("/api/porto/ordens-pagamento/{id}/receber",ids.get("OP-MET-B"))
                .header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON)
                .content("{\"valorRecebido\":200.00,\"dataRecebimento\":\"2026-08-01\"}"))
            .andExpect(status().isOk());

        mvc.perform(get("/api/porto/dashboard").param("numero","OP-MET-").header("Authorization","Bearer "+token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.quantidadeTotalOps").value(4))
            .andExpect(jsonPath("$.valorTotalPrevisto").value(1000.0))
            .andExpect(jsonPath("$.quantidadeSemComposicao").value(1))
            .andExpect(jsonPath("$.valorSemComposicao").value(100.0))
            .andExpect(jsonPath("$.quantidadeConciliadas").value(1))
            .andExpect(jsonPath("$.valorConciliadas").value(200.0))
            .andExpect(jsonPath("$.quantidadeValorAbaixo").value(1))
            .andExpect(jsonPath("$.diferencaTotalAbaixo").value(50.0))
            .andExpect(jsonPath("$.quantidadeValorAcima").value(1))
            .andExpect(jsonPath("$.diferencaTotalAcima").value(50.0))
            .andExpect(jsonPath("$.quantidadeComDivergencia").value(2))
            .andExpect(jsonPath("$.valorTotalDivergencias").value(100.0))
            .andExpect(jsonPath("$.quantidadeRecebidas").value(1))
            .andExpect(jsonPath("$.valorRecebido").value(200.0))
            .andExpect(jsonPath("$.quantidadeVencidasNaoRecebidas").value(1))
            .andExpect(jsonPath("$.valorVencidoNaoRecebido").value(300.0))
            .andExpect(jsonPath("$.valorMedioPorOp").value(250.0))
            .andExpect(jsonPath("$.quantidadeOrdensServico").value(3));

        mvc.perform(get("/api/porto/ordens-pagamento/resumo")
                .param("numero","OP-MET-").param("comDivergencia","true").header("Authorization","Bearer "+token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.quantidadeTotalOps").value(2))
            .andExpect(jsonPath("$.valorTotalPrevisto").value(700.0))
            .andExpect(jsonPath("$.valorTotalDivergencias").value(100.0))
            .andExpect(jsonPath("$.valorMedioPorOp").value(350.0));

        mvc.perform(get("/api/porto/ordens-pagamento").param("numero","OP-MET-").param("statusConciliacao","CONCILIADA")
                .header("Authorization","Bearer "+token))
            .andExpect(status().isOk()).andExpect(jsonPath("$",org.hamcrest.Matchers.hasSize(1)))
            .andExpect(jsonPath("$[0].numero").value("OP-MET-B"))
            .andExpect(jsonPath("$[0].statusConciliacao").value("CONCILIADA"));
    }

    @Test
    void detalhaComposicaoDaOpERegistraJustificativaAuditavel() throws Exception {
        String token=login();
        confirmar(token,previa(token,"op-detalhe.csv","""
            Número da Ordem de Pagamento;Valor Total do Serviço;Nome: Código;Data de Pagamento
            OP-DET-001;500,00;Sintético: Detalhe;31/12/2099
            """),"{}");
        long opId=idsDasOpsPorPrefixo(token,"OP-DET-").get("OP-DET-001");
        importarOs(token,"os-detalhe.csv","OS-DET-001",450,opId);

        mvc.perform(post("/api/porto/ordens-pagamento/{id}/justificativas",opId)
                .header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON)
                .content("{\"motivo\":\"DESCONTO\",\"observacao\":\"Registro sintético para teste\"}"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.motivo").value("DESCONTO"))
            .andExpect(jsonPath("$.usuario").value("Administrador"));

        mvc.perform(get("/api/porto/ordens-pagamento/{id}",opId).header("Authorization","Bearer "+token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.ordemPagamento.numero").value("OP-DET-001"))
            .andExpect(jsonPath("$.ordemPagamento.statusConciliacao").value("VALOR_ABAIXO"))
            .andExpect(jsonPath("$.ordensServico",org.hamcrest.Matchers.hasSize(1)))
            .andExpect(jsonPath("$.justificativas",org.hamcrest.Matchers.hasSize(1)))
            .andExpect(jsonPath("$.justificativas[0].observacao").value("Registro sintético para teste"));
    }

    @Test
    void controlaPendenciaPortoSemTransformarEmDespesa() throws Exception {
        String token=login();
        long previa=previa(token,"servico-pendente.txt","""
            Número da Ordem de Serviço	Valor Total	Especialidade	Sigla da Viatura	Socorrista	QRA	Data de atendimento
            OS-PEND-001	175,00	PANE		SOCORRISTA TESTE	QRA-TESTE-001	2026-08-01 10:00:00
            """);
        confirmar(token,previa,"{}");

        mvc.perform(post("/api/porto/pendencias").header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON).content("""
                    {"numeroOs":"OS-PEND-001","motivo":"PENDENCIA_DOCUMENTAL","valor":175.00,
                     "dataPendencia":"2026-08-01","observacao":"Documento sintético pendente",
                     "responsavel":"RESPONSÁVEL TESTE","statusFinanceiro":"BLOQUEADO_PARA_PAGAMENTO",
                     "prazo":"2026-08-05","referenciaPorto":"REF-TESTE-001"}
                    """))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.referencia").value("OS-PEND-001"))
            .andExpect(jsonPath("$.motivo").value("PENDENCIA_DOCUMENTAL"));

        String pendencias=mvc.perform(get("/api/porto/pendencias").header("Authorization","Bearer "+token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[?(@.referencia == 'OS-PEND-001')].responsavel").value("RESPONSÁVEL TESTE"))
            .andReturn().getResponse().getContentAsString();
        List<Map<String,Object>> encontrada=JsonPath.read(pendencias,"$[?(@.referencia == 'OS-PEND-001')]");
        long pendenciaId=((Number)encontrada.getFirst().get("id")).longValue();

        mvc.perform(get("/api/porto/ordens-servico").header("Authorization","Bearer "+token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[?(@.numero == 'OS-PEND-001')].statusOperacional").value("PENDENTE_PORTO"))
            .andExpect(jsonPath("$[?(@.numero == 'OS-PEND-001')].statusFinanceiro").value("BLOQUEADO_PARA_PAGAMENTO"));

        mvc.perform(get("/api/porto/dashboard").param("numeroOs","OS-PEND-001")
                .header("Authorization","Bearer "+token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.quantidadeTotalServicos").value(1))
            .andExpect(jsonPath("$.valorTotalRealizado").value(175.0))
            .andExpect(jsonPath("$.quantidadeServicosPendentes").value(1))
            .andExpect(jsonPath("$.valorServicosPendentes").value(175.0))
            .andExpect(jsonPath("$.porEspecialidade[0].chave").value("PANE"));

        mvc.perform(patch("/api/porto/pendencias/{id}/resolver",pendenciaId).header("Authorization","Bearer "+token))
            .andExpect(status().isOk()).andExpect(jsonPath("$.situacao").value("RESOLVIDA"));
    }

    @Test
    void aplicaToleranciaDeUmCentavoESeparaDivergenciaDoRecebimento() throws Exception {
        String token=login();confirmar(token,previa(token,"op-tolerancia.csv","""
            Número da Ordem de Pagamento;Valor Total do Serviço;Nome: Código;Data de Pagamento
            OP-TOL-001;100,00;Sintético: Tolerância;31/12/2099
            """),"{}");
        long opId=idsDasOpsPorPrefixo(token,"OP-TOL-").get("OP-TOL-001");importarOs(token,"os-tolerancia.csv","OS-TOL-001",99.99,opId);
        mvc.perform(get("/api/porto/ordens-pagamento").param("numero","OP-TOL-001").header("Authorization","Bearer "+token))
            .andExpect(status().isOk()).andExpect(jsonPath("$[0].statusConciliacao").value("CONCILIADA"));
        mvc.perform(patch("/api/porto/ordens-pagamento/{id}/receber",opId).header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"valorRecebido\":90.00,\"dataRecebimento\":\"2026-08-01\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.statusConciliacao").value("RECEBIDA_COM_DIVERGENCIA"));
        mvc.perform(get("/api/porto/ordens-pagamento/resumo").param("numero","OP-TOL-001").header("Authorization","Bearer "+token))
            .andExpect(status().isOk()).andExpect(jsonPath("$.quantidadeComDivergencia").value(1)).andExpect(jsonPath("$.valorTotalDivergencias").value(10.0));
    }

    private void importarOs(String token,String arquivo,String numero,double valor,long opId) throws Exception {
        long id=previa(token,arquivo,"""
            Número da Ordem de Serviço,Valor Total,Especialidade,Sigla da Viatura,Socorrista,QRA,Data de atendimento
            %s,%.2f,REMOÇÃO,,,,2026-07-30
            """.formatted(numero,valor));
        confirmar(token,id,"{\"ordemPagamentoId\":"+opId+"}");
    }

    private Map<String,Long> idsDasOps(String token) throws Exception {
        return idsDasOpsPorPrefixo(token,"OP-MET-");
    }

    private Map<String,Long> idsDasOpsPorPrefixo(String token,String prefixo) throws Exception {
        String corpo=mvc.perform(get("/api/porto/ordens-pagamento").header("Authorization","Bearer "+token))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        List<Map<String,Object>> itens=JsonPath.read(corpo,"$");
        return itens.stream().filter(x->String.valueOf(x.get("numero")).startsWith(prefixo))
            .collect(java.util.stream.Collectors.toMap(x->String.valueOf(x.get("numero")),x->((Number)x.get("id")).longValue()));
    }

    private long previa(String token,String nome,String csv) throws Exception {
        MockMultipartFile arquivo=new MockMultipartFile("arquivo",nome,"text/csv",csv.getBytes(StandardCharsets.UTF_8));
        String corpo=mvc.perform(multipart("/api/porto/importacoes/previa").file(arquivo)
                .header("Authorization","Bearer "+token)).andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();
        return ((Number)JsonPath.read(corpo,"$.id")).longValue();
    }

    private void confirmar(String token,long id,String corpo) throws Exception {
        mvc.perform(post("/api/porto/importacoes/{id}/confirmar",id).header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON).content(corpo)).andExpect(status().isOk());
    }

    private String login() throws Exception {
        String resposta=mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"admin@fluxogestao.local\",\"senha\":\"Admin@123\"}"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(resposta,"$.token");
    }
}
