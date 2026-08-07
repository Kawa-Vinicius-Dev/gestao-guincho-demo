package com.anaiv.fluxogestao.comissao;

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
class ComissaoApiIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    @Test
    void opPagaUsaPeriodoSelecionadoAgregaServicosAntigosNoDashboardENaComissao() throws Exception {
        String admin=login("admin@fluxogestao.local","Admin@123");
        long usuario=criarUsuario(admin,"Comissionado Alfa","comissao.alfa@local.test");
        long motorista=criarMotorista(admin,"Comissionado Alfa","QRA-ALFA",usuario);
        long calendario=criarCalendario(admin,"2026-08-31","2026-08-01","2026-08-31","Fechamento extraordinário agosto");
        long op1=criarOp(admin,"OP-COM-1000",600,"2026-09-05");
        long op2=criarOp(admin,"OP-COM-400",400,"2026-09-05");

        long importacao=confirmarComposicao(admin,op1,calendario,"comissao-op-1.txt",
            linha("OS-COM-JUN",600,"GUINCHO","QRA-ALFA","30/06/2026"));
        confirmarComposicao(admin,op2,calendario,"comissao-op-2.txt",
            linha("OS-COM-JUL",400,"REMOÇÃO","QRA-ALFA","04/07/2026"));

        mvc.perform(get("/api/dashboard").header("Authorization","Bearer "+admin)
                .param("inicio","2026-08-01").param("fim","2026-08-31"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.receitaRecebida").value(org.hamcrest.Matchers.greaterThanOrEqualTo(1000d)))
            .andExpect(jsonPath("$.saldoRealizado").value(org.hamcrest.Matchers.greaterThanOrEqualTo(1000d)));

        mvc.perform(get("/api/comissoes/resumo").header("Authorization","Bearer "+admin)
                .param("calendarioPagamentoId",String.valueOf(calendario)).param("motoristaId",String.valueOf(motorista)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].quantidadeServicosPagos").value(2))
            .andExpect(jsonPath("$[0].producaoPaga").value(1000d))
            .andExpect(jsonPath("$[0].comissaoBruta").value(200d))
            .andExpect(jsonPath("$[0].liquido").value(200d));

        assertThat(jdbc.queryForObject("select count(*) from ordens_servico_porto where motorista_id=?",Integer.class,motorista)).isEqualTo(2);
        assertThat(jdbc.queryForObject("select count(*) from receitas where ordem_pagamento_porto_id in (?,?)",Integer.class,op1,op2)).isEqualTo(2);
        mvc.perform(post("/api/porto/importacoes/{id}/reprocessar-financeiro",importacao).header("Authorization","Bearer "+admin)
                .contentType(MediaType.APPLICATION_JSON).content("{\"calendarioPagamentoId\":"+calendario+"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.receitasCriadas").value(0));
        mvc.perform(post("/api/porto/importacoes/{id}/reprocessar-financeiro",importacao).header("Authorization","Bearer "+admin))
            .andExpect(status().isOk()).andExpect(jsonPath("$.receitasCriadas").value(0));
        assertThat(jdbc.queryForObject("select count(*) from receitas where ordem_pagamento_porto_id in (?,?)",Integer.class,op1,op2)).isEqualTo(2);
    }

    @Test
    void funcionarioRegistraSomentePropriaAlimentacaoEAprovacaoPodeGerarSaldoNegativo() throws Exception {
        String admin=login("admin@fluxogestao.local","Admin@123");
        long usuario=criarUsuario(admin,"Comissionado Beta","comissao.beta@local.test");
        long motorista=criarMotorista(admin,"Comissionado Beta","QRA-BETA",usuario);
        long calendario=criarCalendario(admin,"2026-10-07","2026-09-01","2026-09-30","Fechamento setembro");
        long op=criarOp(admin,"OP-COM-200",200,"2026-10-07");
        confirmarComposicao(admin,op,calendario,"comissao-beta.txt",linha("OS-COM-BETA",200,"GUINCHO","QRA-BETA","01/07/2026"));

        String funcionario=login("comissao.beta@local.test","Funcionario@123");
        mvc.perform(get("/api/comissoes/periodos").header("Authorization","Bearer "+funcionario))
            .andExpect(status().isOk()).andExpect(jsonPath("$[?(@.id == "+calendario+")]").exists());
        String alimentacao=mvc.perform(post("/api/minha-comissao/alimentacoes").header("Authorization","Bearer "+funcionario)
                .contentType(MediaType.APPLICATION_JSON).content("{\"data\":\"2026-09-10\",\"valor\":50.00,\"observacoes\":\"Refeição sintética\"}"))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.motoristaId").value(motorista))
            .andExpect(jsonPath("$.situacao").value("PENDENTE"))
            .andReturn().getResponse().getContentAsString();
        long despesa=((Number)JsonPath.read(alimentacao,"$.id")).longValue();

        mvc.perform(get("/api/minha-comissao").header("Authorization","Bearer "+funcionario)
                .param("calendarioPagamentoId",String.valueOf(calendario)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.comissaoBruta").value(40d))
            .andExpect(jsonPath("$.alimentacaoAprovada").value(0d)).andExpect(jsonPath("$.alimentacaoPendente").value(50d));

        mvc.perform(patch("/api/despesas/{id}/aprovar",despesa).header("Authorization","Bearer "+admin))
            .andExpect(status().isOk()).andExpect(jsonPath("$.aprovada").value(true));
        mvc.perform(get("/api/minha-comissao").header("Authorization","Bearer "+funcionario)
                .param("calendarioPagamentoId",String.valueOf(calendario)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.alimentacaoAprovada").value(50d))
            .andExpect(jsonPath("$.liquido").value(-10d));

        mvc.perform(get("/api/comissoes/resumo").header("Authorization","Bearer "+funcionario)
                .param("calendarioPagamentoId",String.valueOf(calendario)))
            .andExpect(status().isForbidden());
    }

    @Test
    void alimentacaoPodeSerRegistradaAntesDaOpSemInventarComissao() throws Exception {
        String admin=login("admin@fluxogestao.local","Admin@123");
        long usuario=criarUsuario(admin,"Comissionado Sem OP","comissao.semop@local.test");
        criarMotorista(admin,"Comissionado Sem OP","QRA-SEM-OP",usuario);
        long calendario=criarCalendario(admin,"2027-01-08","2026-12-01","2026-12-31","Fechamento sem OP");
        String funcionario=login("comissao.semop@local.test","Funcionario@123");

        mvc.perform(post("/api/minha-comissao/alimentacoes").header("Authorization","Bearer "+funcionario)
                .contentType(MediaType.APPLICATION_JSON).content("{\"data\":\"2026-12-10\",\"valor\":35.00}"))
            .andExpect(status().isCreated());
        mvc.perform(get("/api/minha-comissao").header("Authorization","Bearer "+funcionario)
                .param("calendarioPagamentoId",String.valueOf(calendario)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.aguardandoOp").value(true))
            .andExpect(jsonPath("$.producaoPaga").value(0d)).andExpect(jsonPath("$.comissaoBruta").value(0d))
            .andExpect(jsonPath("$.alimentacaoPendente").value(35d));
    }

    @Test
    void osSemMapeamentoSeguroFicaPendenteParaAssociacaoAdministrativa() throws Exception {
        String admin=login("admin@fluxogestao.local","Admin@123");
        long usuario=criarUsuario(admin,"Nome Ambíguo","ambiguo.um@local.test");
        long primeiro=criarMotorista(admin,"Nome Ambíguo",null,usuario);
        long usuario2=criarUsuario(admin,"Nome Ambíguo 2","ambiguo.dois@local.test");
        criarMotorista(admin,"Nome Ambíguo",null,usuario2);
        long calendario=criarCalendario(admin,"2026-11-05","2026-10-01","2026-10-31","Fechamento outubro");
        long op=criarOp(admin,"OP-COM-AMB",100,"2026-11-05");
        confirmarComposicao(admin,op,calendario,"comissao-ambiguo.txt",linhaComSocorrista("OS-COM-AMB",100,"GUINCHO","Nome Ambíguo","","03/10/2026"));
        long os=jdbc.queryForObject("select id from ordens_servico_porto where numero='OS-COM-AMB'",Long.class);
        assertThat(jdbc.queryForObject("select motorista_id from ordens_servico_porto where id=?",Long.class,os)).isNull();

        mvc.perform(patch("/api/porto/ordens-servico/{id}/motorista",os).header("Authorization","Bearer "+admin)
                .contentType(MediaType.APPLICATION_JSON).content("{\"motoristaId\":"+primeiro+"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.motoristaId").value(primeiro));
    }

    @Test
    void confirmacaoManualDeOpCompostaReparaFinanceiroSemSepararComissaoDoCaixa() throws Exception {
        String admin=login("admin@fluxogestao.local","Admin@123");
        long usuario=criarUsuario(admin,"Comissionado Recebimento","comissao.recebimento@local.test");
        long motorista=criarMotorista(admin,"Comissionado Recebimento","QRA-RECEB",usuario);
        long calendario=criarCalendario(admin,"2027-03-05","2027-02-01","2027-02-28","Fechamento recebimento manual");
        long op=criarOp(admin,"OP-COM-RECEB",300,"2027-03-05");
        confirmarComposicao(admin,op,calendario,"comissao-recebimento.txt",linha("OS-COM-RECEB",300,"GUINCHO","QRA-RECEB","10/01/2027"));
        jdbc.update("delete from receitas where ordem_pagamento_porto_id=?",op);
        jdbc.update("delete from contas_receber where ordem_pagamento_porto_id=?",op);

        mvc.perform(patch("/api/porto/ordens-pagamento/{id}/receber",op).header("Authorization","Bearer "+admin)
                .contentType(MediaType.APPLICATION_JSON).content("{\"valorRecebido\":300,\"dataRecebimento\":\"2027-03-05\",\"calendarioPagamentoId\":"+calendario+"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.situacao").value("RECEBIDO"));
        assertThat(jdbc.queryForObject("select count(*) from receitas where ordem_pagamento_porto_id=?",Integer.class,op)).isOne();
        mvc.perform(get("/api/dashboard").header("Authorization","Bearer "+admin).param("inicio","2027-03-01").param("fim","2027-03-31"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.receitaRecebida").value(300d));
        mvc.perform(get("/api/comissoes/resumo").header("Authorization","Bearer "+admin).param("calendarioPagamentoId",String.valueOf(calendario)).param("motoristaId",String.valueOf(motorista)))
            .andExpect(status().isOk()).andExpect(jsonPath("$[0].comissaoBruta").value(60d));
    }

    private String linha(String os,int valor,String especialidade,String qra,String data){return linhaComSocorrista(os,valor,especialidade,"",qra,data);}
    private String linhaComSocorrista(String os,int valor,String especialidade,String socorrista,String qra,String data){return "%s\t%d,00\t%s\t\t%s\t%s\t%s\n".formatted(os,valor,especialidade,socorrista,qra,data);}
    private long confirmarComposicao(String token,long op,long calendario,String nome,String linhas) throws Exception {
        String csv="Número da Ordem de Serviço\tValor Total\tEspecialidade\tSigla da Viatura\tSocorrista\tQRA\tData de atendimento\n"+linhas;
        MockMultipartFile arquivo=new MockMultipartFile("arquivo",nome,"text/plain",csv.getBytes(StandardCharsets.UTF_8));
        String resposta=mvc.perform(multipart("/api/porto/ordens-pagamento/{id}/composicao/previa",op).file(arquivo).header("Authorization","Bearer "+token))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        long importacao=((Number)JsonPath.read(resposta,"$.id")).longValue();
        mvc.perform(post("/api/porto/importacoes/{id}/confirmar",importacao).header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"ordemPagamentoId\":"+op+",\"calendarioPagamentoId\":"+calendario+"}"))
            .andExpect(status().isOk());
        return importacao;
    }
    private long criarCalendario(String token,String pagamento,String inicio,String fim,String descricao) throws Exception {return id(postJson(token,"/api/porto/calendario","{\"dataPagamento\":\""+pagamento+"\",\"competenciaInicio\":\""+inicio+"\",\"competenciaFim\":\""+fim+"\",\"descricao\":\""+descricao+"\",\"ativo\":true}"));}
    private long criarOp(String token,String numero,int valor,String data) throws Exception {return id(postJson(token,"/api/porto/ordens-pagamento","{\"numero\":\""+numero+"\",\"dataPrevista\":\""+data+"\",\"valorInformado\":"+valor+",\"statusPorto\":\"PROCESSADO\",\"situacaoFinanceira\":\"PROGRAMADO\",\"pagamentoConfirmado\":false}"));}
    private long criarUsuario(String token,String nome,String email) throws Exception {return id(postJson(token,"/api/usuarios","{\"nome\":\""+nome+"\",\"email\":\""+email+"\",\"senha\":\"Funcionario@123\",\"perfil\":\"FUNCIONARIO\"}"));}
    private long criarMotorista(String token,String nome,String qra,long usuario) throws Exception {return id(postJson(token,"/api/motoristas","{\"nome\":\""+nome+"\",\"qra\":"+(qra==null?"null":"\""+qra+"\"")+",\"usuarioId\":"+usuario+"}"));}
    private String postJson(String token,String caminho,String corpo) throws Exception {return mvc.perform(post(caminho).header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON).content(corpo)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();}
    private long id(String json){return ((Number)JsonPath.read(json,"$.id")).longValue();}
    private String login(String email,String senha) throws Exception {String json=mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\""+email+"\",\"senha\":\""+senha+"\"}")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();return JsonPath.read(json,"$.token");}
}
