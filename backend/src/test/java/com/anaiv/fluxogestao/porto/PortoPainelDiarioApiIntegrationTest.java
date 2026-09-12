package com.anaiv.fluxogestao.porto;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.ObjectMapper;

import java.util.Map;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * O painel do dia cadastra a OS sem valor e sem OP; o relatorio financeiro chega depois e
 * completa a MESMA OS. Os dois usam numeros diferentes para o mesmo servico, entao o que
 * estes testes protegem e o valor nao entrar duas vezes no fechamento do mes.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PortoPainelDiarioApiIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;

    @Test
    void cadastraAcionamentoDoDiaSemValorESemOp() throws Exception {
        String token=login();
        String conteudo="""
            PORTO SEGURO\t7100001/26\tSOCORRO\tL25
            QEBSON RAMOS DA SILV\t11/09/2026\t06:56\t06:56\tACIONADO/FINAL\tEM PROCESSAMENTO\tNão
            """;
        confirmar(token,previa(token,conteudo,"PAINEL_DIARIO",1));

        mvc.perform(get("/api/porto/ordens-servico").param("numeroOs","7100001/26")
                .header("Authorization","Bearer "+token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].valorTotal").value(0))
            .andExpect(jsonPath("$[0].ordemPagamento").doesNotExist())
            .andExpect(jsonPath("$[0].statusFinanceiro").value("AGUARDANDO_OP"))
            .andExpect(jsonPath("$[0].viatura").value("L25"))
            .andExpect(jsonPath("$[0].socorrista").value("QEBSON RAMOS DA SILV"))
            // Nome truncado nunca vira vinculo: quem vincula e o QRA, que so vem no financeiro.
            .andExpect(jsonPath("$[0].motorista").doesNotExist());
    }

    @Test
    void aceitaQualquerSeguradoraELinhaSemViaturaOuSemSocorrista() throws Exception {
        String token=login();
        String conteudo="""
            AZUL SEGUROS\t7100002/26\tSOCORRO\tL168
            LUIZ FELIPE DA SILVA\t11/09/2026\t10:46\t10:46\tACIONADO/FINAL\tEM PROCESSAMENTO\tNão
            PORTO SEGURO\t7100003/26\tSOCORRO\t
            11/09/2026\t08:00\t08:00\tACIONADO/FINAL\tEM PROCESSAMENTO\tNão
            """;
        confirmar(token,previa(token,conteudo,"PAINEL_DIARIO",2));

        mvc.perform(get("/api/porto/ordens-servico").param("numeroOs","7100002/26")
                .header("Authorization","Bearer "+token))
            .andExpect(jsonPath("$[0].seguradora").value("AZUL SEGUROS"));
        // Sem viatura e sem socorrista a linha ainda entra: perder o acionamento do dia e pior.
        mvc.perform(get("/api/porto/ordens-servico").param("numeroOs","7100003/26")
                .header("Authorization","Bearer "+token))
            .andExpect(jsonPath("$[0].socorrista").doesNotExist())
            .andExpect(jsonPath("$[0].viatura").doesNotExist());
    }

    @Test
    void servicoCanceladoFicaMarcadoENaoEsperaPagamento() throws Exception {
        String token=login();
        String conteudo="""
            PORTO SEGURO\t7100004/26\tSOCORRO\tL845
            ANDERSON JORGE RIBEI\t11/09/2026\t14:10\t14:10\tCANCELADO\tSERVIÇO CANCELADO\tNão
            """;
        confirmar(token,previa(token,conteudo,"PAINEL_DIARIO",1));

        mvc.perform(get("/api/porto/ordens-servico").param("numeroOs","7100004/26")
                .header("Authorization","Bearer "+token))
            .andExpect(jsonPath("$[0].statusOperacional").value("CANCELADO"));
    }

    /** O caso que motivou a chave normalizada: painel primeiro, financeiro depois. */
    @Test
    void financeiroCompletaAOsDoPainelEmVezDeDuplicar() throws Exception {
        String token=login();
        confirmar(token,previa(token,"""
            PORTO SEGURO\t7100005/26\tSOCORRO\tL25
            QEBSON RAMOS DA SILV\t11/09/2026\t06:56\t06:56\tACIONADO/FINAL\tEM PROCESSAMENTO\tNão
            ""","PAINEL_DIARIO",1));

        // O financeiro chama a mesma OS de "01/7100005-26" e traz valor, QRA e especialidade real.
        confirmarComOp(token,previa(token,"""
            "Número da Ordem de Serviço"\t"Valor Total"\t"Especialidade"\t"Sigla da Viatura"\t"Socorrista"\t"QRA"\t"Data de atendimento"
            "01/7100005-26"\t"181.00"\t"GUINCHO"\t""\t"QEBSON RAMOS DA SILVA"\t"609690"\t"2026-09-11 06:56:00"
            ""","SERVICOS_GERAIS",1),"OP-PAINEL-5",calendario(token,"2072-08-14","2072-07-01","2072-07-15"));

        // Uma unica OS, agora com o numero oficial do financeiro e com o valor preenchido.
        mvc.perform(get("/api/porto/ordens-servico").param("numeroOs","01/7100005-26")
                .header("Authorization","Bearer "+token))
            .andExpect(jsonPath("$.length()").value(1))
            .andExpect(jsonPath("$[0].valorTotal").value(181.00))
            .andExpect(jsonPath("$[0].especialidade").value("GUINCHO"))
            .andExpect(jsonPath("$[0].socorrista").value("QEBSON RAMOS DA SILVA"));
        // O numero antigo nao existe mais como OS separada.
        mvc.perform(get("/api/porto/ordens-servico").param("numeroOs","7100005/26")
                .header("Authorization","Bearer "+token))
            .andExpect(jsonPath("$").isEmpty());
    }

    /** Ordem invertida: o painel nao pode rebaixar o dado bom que o financeiro ja gravou. */
    @Test
    void painelNaoSobrescreveDadoQueVeioDoFinanceiro() throws Exception {
        String token=login();
        confirmarComOp(token,previa(token,"""
            "Número da Ordem de Serviço"\t"Valor Total"\t"Especialidade"\t"Sigla da Viatura"\t"Socorrista"\t"QRA"\t"Data de atendimento"
            "01/7100006-26"\t"204.50"\t"GUINCHO"\t""\t"JEFERSON MARTINS DA SILVA"\t"57665"\t"2026-09-11 08:00:00"
            ""","SERVICOS_GERAIS",1),"OP-PAINEL-6",calendario(token,"2072-09-14","2072-08-01","2072-08-15"));

        confirmar(token,previa(token,"""
            PORTO SEGURO\t7100006/26\tSOCORRO\tL25
            JEFERSON MARTINS DA \t11/09/2026\t08:00\t08:00\tACIONADO/FINAL\tEM PROCESSAMENTO\tNão
            ""","PAINEL_DIARIO",1));

        mvc.perform(get("/api/porto/ordens-servico").param("numeroOs","01/7100006-26")
                .header("Authorization","Bearer "+token))
            .andExpect(jsonPath("$.length()").value(1))
            .andExpect(jsonPath("$[0].valorTotal").value(204.50))
            .andExpect(jsonPath("$[0].especialidade").value("GUINCHO"))
            .andExpect(jsonPath("$[0].socorrista").value("JEFERSON MARTINS DA SILVA"));
    }

    /**
     * Carga real de um dia de operacao, colada da tela da Porto. Cobre o que os exemplos
     * sinteticos nao pegam: tipo REMOCAO, tres seguradoras, uma OS cancelada sem viatura e
     * sem socorrista, e a mesma viatura (L25) com dois socorristas diferentes no mesmo dia.
     */
    @Test
    void importaUmDiaRealDeOperacaoInteiro() throws Exception {
        String token=login();
        String conteudo="""
            PORTO SEGURO\t5609411/26\tSOCORRO\tL25
            QEBSON RAMOS DA SILV\t10/09/2026\t07:48\t07:48\tACIONADO/FINAL\tEM PROCESSAMENTO\tNão
            PORTO SEGURO\t5610120/26\tSOCORRO\tL845
            ANDERSON JORGE RIBEI\t10/09/2026\t08:31\t08:31\tACIONADO/FINAL\tEM PROCESSAMENTO\tNão
            PORTO SEGURO\t5608606/26\tSOCORRO\t
            10/09/2026\t09:00\t09:00\tCANCELADO\tSERVIÇO CANCELADO\tNão
            AZUL SEGUROS\t5611191/26\tREMOCAO\tL25
            QEBSON RAMOS DA SILV\t10/09/2026\t09:12\t09:12\tACIONADO/FINAL\tEM PROCESSAMENTO\tNão
            PORTO SEGURO\t5611906/26\tSOCORRO\tK85
            DJALMA BEZERRA DE ME\t10/09/2026\t09:36\t09:36\tACIONADO/FINAL\tEM PROCESSAMENTO\tNão
            ITAU FROTA E RESIDE.\t5619751/26\tSOCORRO\tL25
            QEBSON RAMOS DA SILV\t10/09/2026\t14:17\t14:17\tACIONADO/FINAL\tEM PROCESSAMENTO\tNão
            PORTO SEGURO\t5630746/26\tSOCORRO\tL25
            EDUARDO MARTINS DA S\t10/09/2026\t21:13\t21:13\tACIONADO/FINAL\tEM PROCESSAMENTO\tNão
            """;
        confirmar(token,previa(token,conteudo,"PAINEL_DIARIO",7));

        // A cancelada entra mesmo sem viatura e sem socorrista - perder o registro seria pior.
        mvc.perform(get("/api/porto/ordens-servico").param("numeroOs","5608606/26")
                .header("Authorization","Bearer "+token))
            .andExpect(jsonPath("$[0].statusOperacional").value("CANCELADO"))
            .andExpect(jsonPath("$[0].viatura").doesNotExist());
        // Tipo novo da Porto entra como veio, sem lista fechada no caminho.
        mvc.perform(get("/api/porto/ordens-servico").param("numeroOs","5611191/26")
                .header("Authorization","Bearer "+token))
            .andExpect(jsonPath("$[0].especialidade").value("REMOCAO"))
            .andExpect(jsonPath("$[0].seguradora").value("AZUL SEGUROS"));
        // Mesma viatura, dois socorristas no mesmo dia: nao da para deduzir dono por viatura.
        mvc.perform(get("/api/porto/ordens-servico").param("numeroOs","5630746/26")
                .header("Authorization","Bearer "+token))
            .andExpect(jsonPath("$[0].viatura").value("L25"))
            .andExpect(jsonPath("$[0].socorrista").value("EDUARDO MARTINS DA S"));
    }

    /**
     * Quando a OS ja foi tratada, a tela da Porto devolve o registro inteiro numa linha so, em vez
     * de quebrar em duas. Sao as mesmas colunas - o parser precisa aceitar os dois jeitos, senao a
     * carga do dia falha dependendo de quando o operador copiou.
     */
    @Test
    void aceitaORegistroEmUmaLinhaSoQuandoAOsJaFoiTratada() throws Exception {
        String token=login();
        String conteudo="""
            AZUL SEGUROS\t7200001/26\tSOCORRO\tK85\tNATANAEL JOSE DE FRE\t01/08/2026\t08:30\t08:30\tACIONADO/FINAL\tFINALIZADO\tNão
            ITAU FROTA E RESIDE.\t7200002/26\tTRANSPORTE\tK85\tNATANAEL JOSE DE FRE\t01/08/2026\t12:10\t12:10\tCANCELADO\tFINALIZADO\tNão
            AZUL SEGUROS\t7200003/26\tREMOCAO\t\t\t02/08/2026\t19:52\t19:52\tACIONADO/FINAL\tFINALIZADO\tNão
            """;
        confirmar(token,previa(token,conteudo,"PAINEL_DIARIO",3));

        mvc.perform(get("/api/porto/ordens-servico").param("numeroOs","7200001/26")
                .header("Authorization","Bearer "+token))
            .andExpect(jsonPath("$[0].viatura").value("K85"))
            .andExpect(jsonPath("$[0].socorrista").value("NATANAEL JOSE DE FRE"))
            .andExpect(jsonPath("$[0].seguradora").value("AZUL SEGUROS"))
            .andExpect(jsonPath("$[0].dataAtendimento").value("2026-08-01"));
        mvc.perform(get("/api/porto/ordens-servico").param("numeroOs","7200002/26")
                .header("Authorization","Bearer "+token))
            .andExpect(jsonPath("$[0].statusOperacional").value("CANCELADO"));
        // Sem viatura e sem socorrista, as duas colunas vazias seguidas nao podem desalinhar a data.
        mvc.perform(get("/api/porto/ordens-servico").param("numeroOs","7200003/26")
                .header("Authorization","Bearer "+token))
            .andExpect(jsonPath("$[0].dataAtendimento").value("2026-08-02"))
            .andExpect(jsonPath("$[0].especialidade").value("REMOCAO"));
    }

    /** Numeros reais: o painel diz "4925666/26" e a OP diz "04/4925666-26" - mesma OS. */
    @Test
    void numeroDoPainelCasaComONumeroDaOpEmDadosReais() throws Exception {
        String token=login();
        confirmar(token,previa(token,"""
            AZUL SEGUROS\t4925666/26\tREMOCAO\tL845\tANDERSON JORGE RIBEI\t02/08/2026\t18:18\t18:18\tACIONADO/FINAL\tFINALIZADO\tNão
            ""","PAINEL_DIARIO",1));

        confirmarComOp(token,previa(token,"""
            "Número da Ordem de Serviço"\t"Valor Total"\t"Especialidade"\t"Sigla da Viatura"\t"Socorrista"\t"QRA"\t"Data de atendimento"
            "04/4925666-26"\t"536.80"\t"GUINCHO"\t""\t"ANDERSON JORGE RIBEIRO"\t"619238"\t"2026-08-02 19:18:55"
            ""","SERVICOS_GERAIS",1),"OP-REAL-4925666",calendario(token,"2093-08-14","2093-07-01","2093-07-15"));

        // Uma OS so, com o numero oficial da OP e o valor preenchido.
        mvc.perform(get("/api/porto/ordens-servico").param("numeroOs","04/4925666-26")
                .header("Authorization","Bearer "+token))
            .andExpect(jsonPath("$.length()").value(1))
            .andExpect(jsonPath("$[0].valorTotal").value(536.80));
        mvc.perform(get("/api/porto/ordens-servico").param("numeroOs","4925666/26")
                .header("Authorization","Bearer "+token))
            .andExpect(jsonPath("$").isEmpty());
    }

    private long previa(String token,String conteudo,String tipoEsperado,int novos) throws Exception {
        String resposta=mvc.perform(post("/api/porto/importacoes/previa-conteudo")
                .header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("conteudo",conteudo))))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.tipo").value(tipoEsperado))
            .andExpect(jsonPath("$.resumo.registrosNovos").value(novos))
            .andReturn().getResponse().getContentAsString();
        return ((Number)JsonPath.read(resposta,"$.id")).longValue();
    }

    private void confirmar(String token,long id) throws Exception {
        mvc.perform(post("/api/porto/importacoes/{id}/confirmar",id).header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isOk());
    }

    /** O relatorio financeiro sempre fecha contra uma OP e um ciclo; o painel diario nao. */
    private void confirmarComOp(String token,long id,String numeroOp,long calendario) throws Exception {
        mvc.perform(post("/api/porto/importacoes/{id}/confirmar",id).header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"numeroOrdemPagamento\":\""+numeroOp+"\",\"calendarioPagamentoId\":"+calendario
                    +",\"confirmarDivergencias\":true,\"confirmarReassociacoes\":true}"))
            .andExpect(status().isOk());
    }

    private long calendario(String token,String pagamento,String inicio,String fim) throws Exception {
        String resposta=mvc.perform(post("/api/porto/calendario").header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"dataPagamento\":\""+pagamento+"\",\"competenciaInicio\":\""+inicio+"\",\"competenciaFim\":\""+fim
                    +"\",\"descricao\":\"Ciclo painel diário\",\"ativo\":true}"))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return ((Number)JsonPath.read(resposta,"$.id")).longValue();
    }

    private String login() throws Exception {
        String resposta=mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"admin@fluxogestao.local\",\"senha\":\"Admin@123\"}"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(resposta,"$.token");
    }
}
