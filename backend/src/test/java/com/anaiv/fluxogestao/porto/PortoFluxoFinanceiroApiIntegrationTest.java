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

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PortoFluxoFinanceiroApiIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    @Test
    void confirmaOpsPagasNasDuasQuinzenasEAtualizaFinanceiroDashboardEDre() throws Exception {
        String token=login();
        long opPrimeira=criarOp(token,"OP-FIN-Q1",100,"2026-08-14");
        long opSegunda=criarOp(token,"OP-FIN-Q2",250,"2026-08-28");

        String primeira=confirmarComposicao(token,opPrimeira,"q1-financeiro.txt",linha("OS-FIN-Q1",100,"10/07/2026"));
        String segunda=confirmarComposicao(token,opSegunda,"q2-financeiro.txt",linha("OS-FIN-Q2",250,"20/07/2026"));

        assertThat((String)JsonPath.read(primeira,"$.quinzena")).isEqualTo("01/07/2026 a 15/07/2026");
        assertThat((String)JsonPath.read(primeira,"$.dataPagamento")).isEqualTo("2026-08-14");
        assertThat((String)JsonPath.read(segunda,"$.quinzena")).isEqualTo("16/07/2026 a 31/07/2026");
        assertThat((String)JsonPath.read(segunda,"$.dataPagamento")).isEqualTo("2026-08-28");
        assertThat((Integer)JsonPath.read(primeira,"$.receitasCriadas")).isEqualTo(1);
        assertThat(((Number)JsonPath.read(primeira,"$.valorTotalRecebido")).doubleValue()).isEqualTo(100d);

        assertThat(contar("contas_receber","ordem_servico_porto_id",osId("OS-FIN-Q1"))).isEqualTo(1);
        assertThat(contar("receitas","ordem_servico_porto_id",osId("OS-FIN-Q1"))).isEqualTo(1);
        assertThat(jdbc.queryForMap("select status, data_competencia, vencimento, data_recebimento, valor_recebido from contas_receber where ordem_servico_porto_id=?",osId("OS-FIN-Q1")))
            .containsEntry("status","RECEBIDO")
            .containsEntry("data_competencia",java.sql.Date.valueOf("2026-07-10"))
            .containsEntry("vencimento",java.sql.Date.valueOf("2026-08-14"))
            .containsEntry("data_recebimento",java.sql.Date.valueOf("2026-08-14"));
        assertThat(jdbc.queryForMap("select status, data_competencia, data_recebimento from receitas where ordem_servico_porto_id=?",osId("OS-FIN-Q2")))
            .containsEntry("status","RECEBIDA")
            .containsEntry("data_competencia",java.sql.Date.valueOf("2026-07-20"))
            .containsEntry("data_recebimento",java.sql.Date.valueOf("2026-08-28"));
        assertThat(jdbc.queryForObject("select sum(valor) from receitas where ordem_servico_porto_id in (?,?)",java.math.BigDecimal.class,osId("OS-FIN-Q1"),osId("OS-FIN-Q2")))
            .isEqualByComparingTo("350.00");

        mvc.perform(get("/api/dashboard").header("Authorization","Bearer "+token)
                .param("inicio","2026-08-01").param("fim","2026-08-31"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.receitaRecebida").value(org.hamcrest.Matchers.greaterThanOrEqualTo(350d)));
        mvc.perform(get("/api/relatorios/receita-contratante.csv").header("Authorization","Bearer "+token)
                .param("inicio","2026-07-01").param("fim","2026-07-31"))
            .andExpect(status().isOk()).andExpect(content().string(containsString("Porto Seguro")));
    }

    @Test
    void servicosGeraisConfirmadosComoOpPagaVinculamFinanceiroDashboardsEComissaoSemDuplicar() throws Exception {
        String token=login();
        long usuario=criarUsuario(token,"Motorista Importação Paga","motorista.importacao.paga@local.test");
        long motorista=criarMotorista(token,"Motorista Importação Paga","QRA-IMPORTACAO-PAGA",usuario);
        long calendario=criarCalendario(token,"2044-08-15","2044-07-01","2044-07-31","OP paga em agosto");
        long op=criarOp(token,"OP-SERVICOS-GERAIS-PAGA",300,"2044-08-15");
        String linhas=linhaComQra("OS-SERVICOS-GERAIS-PAGA",300,"QRA-IMPORTACAO-PAGA","10/07/2044");

        long importacao=previaServicosGerais(token,"op-paga-servicos-gerais.txt",linhas);
        mvc.perform(post("/api/porto/importacoes/{id}/avaliar",importacao).header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"ordemPagamentoId\":"+op+"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.tipo").value("SERVICOS_GERAIS"))
            .andExpect(jsonPath("$.requerOrdemPagamento").value(true));
        String confirmacao=confirmar(token,importacao,op,calendario);

        assertThat((Integer)JsonPath.read(confirmacao,"$.receitasCriadas")).isOne();
        assertThat(((Number)JsonPath.read(confirmacao,"$.valorTotalRecebido")).doubleValue()).isEqualTo(300d);
        assertThat((String)JsonPath.read(confirmacao,"$.dataPagamento")).isEqualTo("2044-08-15");
        long os=osId("OS-SERVICOS-GERAIS-PAGA");
        assertThat(jdbc.queryForMap("select ordem_pagamento_id, status_financeiro_fluxo, data_efetiva_pagamento, motorista_id from ordens_servico_porto where id=?",os))
            .containsEntry("ordem_pagamento_id",op)
            .containsEntry("status_financeiro_fluxo","RECEBIDO")
            .containsEntry("data_efetiva_pagamento",java.sql.Date.valueOf("2044-08-15"))
            .containsEntry("motorista_id",motorista);
        assertThat(jdbc.queryForMap("select status, data_competencia, data_recebimento from contas_receber where ordem_servico_porto_id=?",os))
            .containsEntry("status","RECEBIDO")
            .containsEntry("data_competencia",java.sql.Date.valueOf("2044-07-10"))
            .containsEntry("data_recebimento",java.sql.Date.valueOf("2044-08-15"));
        assertThat(jdbc.queryForMap("select status, data_competencia, data_recebimento from receitas where ordem_servico_porto_id=?",os))
            .containsEntry("status","RECEBIDA")
            .containsEntry("data_competencia",java.sql.Date.valueOf("2044-07-10"))
            .containsEntry("data_recebimento",java.sql.Date.valueOf("2044-08-15"));

        mvc.perform(get("/api/porto/dashboard").header("Authorization","Bearer "+token)
                .param("periodo","PERSONALIZADO").param("dataInicio","2044-07-01").param("dataFim","2044-07-31"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.valorTotalRealizado").value(300d))
            .andExpect(jsonPath("$.valorEfetivamenteRecebido").value(0d));
        mvc.perform(get("/api/porto/dashboard").header("Authorization","Bearer "+token)
                .param("periodo","PERSONALIZADO").param("dataInicio","2044-08-01").param("dataFim","2044-08-31"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.valorTotalRealizado").value(0d))
            .andExpect(jsonPath("$.valorEfetivamenteRecebido").value(300d));
        mvc.perform(get("/api/dashboard").header("Authorization","Bearer "+token)
                .param("inicio","2044-08-01").param("fim","2044-08-31"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.receitaRecebida").value(300d));
        mvc.perform(get("/api/comissoes/resumo").header("Authorization","Bearer "+token)
                .param("calendarioPagamentoId",String.valueOf(calendario)).param("motoristaId",String.valueOf(motorista)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].quantidadeServicosPagos").value(1))
            .andExpect(jsonPath("$[0].producaoPaga").value(300d))
            .andExpect(jsonPath("$[0].comissaoBruta").value(60d));

        long repetida=previaServicosGerais(token,"op-paga-servicos-gerais-repetida.txt",linhas);
        confirmar(token,repetida,op,calendario);
        assertThat(jdbc.queryForObject("select count(*) from ordens_servico_porto where numero=?",Integer.class,"OS-SERVICOS-GERAIS-PAGA")).isOne();
        assertThat(contar("contas_receber","ordem_servico_porto_id",os)).isOne();
        assertThat(contar("receitas","ordem_servico_porto_id",os)).isOne();
        mvc.perform(get("/api/comissoes/resumo").header("Authorization","Bearer "+token)
                .param("calendarioPagamentoId",String.valueOf(calendario)).param("motoristaId",String.valueOf(motorista)))
            .andExpect(status().isOk()).andExpect(jsonPath("$[0].quantidadeServicosPagos").value(1));
    }

    @Test
    void exigePeriodoFinanceiroExplicitoAntesDeQualquerPersistencia() throws Exception {
        String token=login();long op=criarOp(token,"OP-FIN-SEM-CAL",300,"2027-01-30");
        long previa=previaComposicao(token,op,"sem-calendario.txt",linha("OS-FIN-VALIDA",100,"10/11/2026")+linha("OS-FIN-SEM-CAL",200,"20/12/2026"));

        mvc.perform(post("/api/porto/importacoes/{id}/confirmar",previa).header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"ordemPagamentoId\":"+op+"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.detalhe").value(containsString("Selecione o período financeiro")));

        assertThat(jdbc.queryForObject("select count(*) from ordens_servico_porto where numero in ('OS-FIN-VALIDA','OS-FIN-SEM-CAL')",Integer.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from contas_receber where ordem_pagamento_porto_id=?",Integer.class,op)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from receitas where ordem_pagamento_porto_id=?",Integer.class,op)).isZero();
    }

    @Test
    void reimportaEAtualizaSemDuplicarEBackfillEIdempotente() throws Exception {
        String token=login();long op=criarOp(token,"OP-FIN-IDEMP",180,"2026-08-14");
        long importacao=previaComposicao(token,op,"idempotente.txt",linha("OS-FIN-IDEMP",180,"10/07/2026"));
        confirmar(token,importacao,op);

        long repetida=previaComposicao(token,op,"idempotente-reenvio.txt",linha("OS-FIN-IDEMP",180,"10/07/2026"));
        String resposta=confirmar(token,repetida,op);
        assertThat((Integer)JsonPath.read(resposta,"$.receitasCriadas")).isZero();
        assertThat(contar("contas_receber","ordem_servico_porto_id",osId("OS-FIN-IDEMP"))).isEqualTo(1);
        assertThat(contar("receitas","ordem_servico_porto_id",osId("OS-FIN-IDEMP"))).isEqualTo(1);

        jdbc.update("delete from receitas where ordem_servico_porto_id=?",osId("OS-FIN-IDEMP"));
        jdbc.update("delete from contas_receber where ordem_servico_porto_id=?",osId("OS-FIN-IDEMP"));
        mvc.perform(post("/api/porto/importacoes/{id}/reprocessar-financeiro",importacao).header("Authorization","Bearer "+token))
            .andExpect(status().isOk()).andExpect(jsonPath("$.receitasCriadas").value(1));
        mvc.perform(post("/api/porto/importacoes/{id}/reprocessar-financeiro",importacao).header("Authorization","Bearer "+token))
            .andExpect(status().isOk()).andExpect(jsonPath("$.receitasCriadas").value(0));
        assertThat(contar("contas_receber","ordem_servico_porto_id",osId("OS-FIN-IDEMP"))).isEqualTo(1);
        assertThat(contar("receitas","ordem_servico_porto_id",osId("OS-FIN-IDEMP"))).isEqualTo(1);
        mvc.perform(post("/api/porto/importacoes/{id}/reprocessar-financeiro",importacao))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void aguardandoLancamentoNaoGeraMovimentoFinanceiro() throws Exception {
        String token=login();int contasAntes=jdbc.queryForObject("select count(*) from contas_receber",Integer.class);int receitasAntes=jdbc.queryForObject("select count(*) from receitas",Integer.class);
        String conteudo="""
            01/0000199-26
            PRESTADOR SINTÉTICO
            31/07/2026 10:30
            PORTO SEGURO CIA DE SEGUROS GERAIS
            GUINCHO
            CLIENTE SINTÉTICO
            ABC1D23
            R$ 181,00
            Aguardando Lançamento
            """;
        String previa=mvc.perform(post("/api/porto/importacoes/previa-conteudo").header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON).content(tools.jackson.databind.json.JsonMapper.builder().build().writeValueAsString(java.util.Map.of("conteudo",conteudo))))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.tipo").value("SERVICOS_AGUARDANDO_LANCAMENTO"))
            .andReturn().getResponse().getContentAsString();
        long id=((Number)JsonPath.read(previa,"$.id")).longValue();
        mvc.perform(post("/api/porto/importacoes/{id}/confirmar",id).header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isOk());
        assertThat(jdbc.queryForObject("select count(*) from contas_receber",Integer.class)).isEqualTo(contasAntes);
        assertThat(jdbc.queryForObject("select count(*) from receitas",Integer.class)).isEqualTo(receitasAntes);
    }

    private String linha(String os,int valor,String data){return "%s\t%d,00\tGUINCHO\t\tSOCORRISTA SINTÉTICO\t\t%s\n".formatted(os,valor,data);}
    private String linhaComQra(String os,int valor,String qra,String data){return "%s\t%d,00\tGUINCHO\t\t\t%s\t%s\n".formatted(os,valor,qra,data);}
    private long previaServicosGerais(String token,String nome,String linhas) throws Exception {
        String csv="Número da Ordem de Serviço\tValor Total\tEspecialidade\tSigla da Viatura\tSocorrista\tQRA\tData de atendimento\n"+linhas;
        MockMultipartFile arquivo=new MockMultipartFile("arquivo",nome,"text/plain",csv.getBytes(StandardCharsets.UTF_8));
        String resposta=mvc.perform(multipart("/api/porto/importacoes/previa").file(arquivo).header("Authorization","Bearer "+token))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.tipo").value("SERVICOS_GERAIS"))
            .andExpect(jsonPath("$.requerOrdemPagamento").value(true))
            .andReturn().getResponse().getContentAsString();
        return ((Number)JsonPath.read(resposta,"$.id")).longValue();
    }
    private long previaComposicao(String token,long op,String nome,String linhas) throws Exception {
        String csv="Número da Ordem de Serviço\tValor Total\tEspecialidade\tSigla da Viatura\tSocorrista\tQRA\tData de atendimento\n"+linhas;
        MockMultipartFile arquivo=new MockMultipartFile("arquivo",nome,"text/plain",csv.getBytes(StandardCharsets.UTF_8));
        String resposta=mvc.perform(multipart("/api/porto/ordens-pagamento/{id}/composicao/previa",op).file(arquivo).header("Authorization","Bearer "+token))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return ((Number)JsonPath.read(resposta,"$.id")).longValue();
    }
    private String confirmarComposicao(String token,long op,String nome,String linhas) throws Exception {return confirmar(token,previaComposicao(token,op,nome,linhas),op);}
    private String confirmar(String token,long importacao,long op) throws Exception {return mvc.perform(post("/api/porto/importacoes/{id}/confirmar",importacao).header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON).content("{\"ordemPagamentoId\":"+op+"}" )).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();}
    private String confirmar(String token,long importacao,long op,long calendario) throws Exception {return mvc.perform(post("/api/porto/importacoes/{id}/confirmar",importacao).header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON).content("{\"ordemPagamentoId\":"+op+",\"calendarioPagamentoId\":"+calendario+"}" )).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();}
    private long criarOp(String token,String numero,int valor,String data) throws Exception {String resposta=mvc.perform(post("/api/porto/ordens-pagamento").header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON).content("""
        {"numero":"%s","dataPrevista":"%s","valorInformado":%d,"statusPorto":"PROCESSADO","situacaoFinanceira":"PROGRAMADO","pagamentoConfirmado":false,"observacao":"Sintético"}
        """.formatted(numero,data,valor))).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();return ((Number)JsonPath.read(resposta,"$.id")).longValue();}
    private long criarCalendario(String token,String pagamento,String inicio,String fim,String descricao) throws Exception {String resposta=mvc.perform(post("/api/porto/calendario").header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON).content("{\"dataPagamento\":\""+pagamento+"\",\"competenciaInicio\":\""+inicio+"\",\"competenciaFim\":\""+fim+"\",\"descricao\":\""+descricao+"\",\"ativo\":true}" )).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();return ((Number)JsonPath.read(resposta,"$.id")).longValue();}
    private long criarUsuario(String token,String nome,String email) throws Exception {String resposta=mvc.perform(post("/api/usuarios").header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON).content("{\"nome\":\""+nome+"\",\"email\":\""+email+"\",\"senha\":\"Funcionario@123\",\"perfil\":\"FUNCIONARIO\"}" )).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();return ((Number)JsonPath.read(resposta,"$.id")).longValue();}
    private long criarMotorista(String token,String nome,String qra,long usuario) throws Exception {String resposta=mvc.perform(post("/api/motoristas").header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON).content("{\"nome\":\""+nome+"\",\"qra\":\""+qra+"\",\"usuarioId\":"+usuario+"}" )).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();return ((Number)JsonPath.read(resposta,"$.id")).longValue();}
    private long osId(String numero){return jdbc.queryForObject("select id from ordens_servico_porto where numero=?",Long.class,numero);}
    private int contar(String tabela,String coluna,long id){return jdbc.queryForObject("select count(*) from "+tabela+" where "+coluna+"=?",Integer.class,id);}
    private String login() throws Exception {String resposta=mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"admin@fluxogestao.local\",\"senha\":\"Admin@123\"}")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();return JsonPath.read(resposta,"$.token");}
}
