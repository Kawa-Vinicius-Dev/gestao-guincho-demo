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

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * O valor de uma OS e o que a Porta pagou: entra na importacao e nao se mexe mais. O vinculo com o
 * socorrista e outra coisa - e descoberto depois, pelo operacional, e pode ser corrigido quantas
 * vezes precisar. Este teste separa as duas: o QRA desconhecido nao trava nada, o lancamento
 * financeiro nasce completo mesmo sem socorrista, e associar depois muda so quem executou.
 */
@SpringBootTest
@AutoConfigureMockMvc @ActiveProfiles("test")
class PortoValorImportadoApiIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    @Test void qraDesconhecidoNaoTravaAImportacaoEOValorImportadoNaoMudaAoAssociarDepois() throws Exception {
        String token=login();
        long veiculo=id(criar(token,"/api/veiculos","{\"identificacao\":\"VTR-IMUT-1\",\"placa\":\"IMU1A23\",\"modelo\":\"Guincho\",\"custoPorKm\":2.00}"));
        long socorrista=id(criar(token,"/api/motoristas","{\"nome\":\"Socorrista Imutavel\",\"qra\":\"QRA-IMUT-1\",\"veiculoId\":"+veiculo+"}"));
        long calendario=id(criar(token,"/api/porto/calendario","{\"dataPagamento\":\"2073-08-14\",\"competenciaInicio\":\"2073-07-01\",\"competenciaFim\":\"2073-07-15\",\"descricao\":\"Ciclo imutavel\",\"ativo\":true}"));

        MockMultipartFile arquivo=new MockMultipartFile("arquivo","imutavel.csv","text/csv",("""
            Número da Ordem de Serviço,Valor Total,Especialidade,Sigla da Viatura,Socorrista,QRA,Data de atendimento
            OS-IMUT-CONHECIDO,150.00,GUINCHO,,SOCORRISTA IMUTAVEL,QRA-IMUT-1,05/07/2073
            OS-IMUT-ORFA,275.50,PANE SECA,,QUEM SERA,QRA-NAO-CADASTRADO,06/07/2073
            OS-IMUT-SEMQRA,90.25,CHAVEIRO,,SEM IDENTIFICACAO,,07/07/2073
            """).getBytes(StandardCharsets.UTF_8));
        long previa=id(mvc.perform(multipart("/api/porto/importacoes/previa").file(arquivo).header("Authorization","Bearer "+token))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.osSemSocorrista.length()").value(2))
            .andReturn().getResponse().getContentAsString());

        // sem confirmar nada de excecao: QRA ausente ou desconhecido nao e divergencia, e nao trava
        mvc.perform(post("/api/porto/importacoes/{id}/confirmar",previa).header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"numeroOrdemPagamento\":\"OP-IMUT-1\",\"calendarioPagamentoId\":"+calendario+"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.importados").value(3))
            .andExpect(jsonPath("$.receitasCriadas").value(3))
            .andExpect(jsonPath("$.valorTotalRecebido").value(515.75));

        // a OS orfa entra completa: valor, data e lancamento financeiro, so sem socorrista
        assertThat(motoristaDa("OS-IMUT-ORFA")).isNull();
        assertThat(valorDaOs("OS-IMUT-ORFA")).isEqualByComparingTo("275.50");
        assertThat(valorDaReceitaDa("OS-IMUT-ORFA")).isEqualByComparingTo("275.50");
        assertThat(valorDaContaDa("OS-IMUT-ORFA")).isEqualByComparingTo("275.50");

        long osOrfa=idDaOs("OS-IMUT-ORFA");
        mvc.perform(patch("/api/porto/ordens-servico/{id}/motorista",osOrfa).header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"motoristaId\":"+socorrista+"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.motoristaId").value(socorrista))
            .andExpect(jsonPath("$.valorTotal").value(275.50));

        // associar mudou quem executou e o veiculo dele, e nada do dinheiro
        assertThat(motoristaDa("OS-IMUT-ORFA")).isEqualTo(socorrista);
        assertThat(motoristaDaReceitaDa("OS-IMUT-ORFA")).isEqualTo(socorrista);
        assertThat(veiculoDaReceitaDa("OS-IMUT-ORFA")).isEqualTo(veiculo);
        assertThat(valorDaOs("OS-IMUT-ORFA")).isEqualByComparingTo("275.50");
        assertThat(valorDaReceitaDa("OS-IMUT-ORFA")).isEqualByComparingTo("275.50");
        assertThat(valorDaContaDa("OS-IMUT-ORFA")).isEqualByComparingTo("275.50");
        assertThat(dataRecebimentoDaReceitaDa("OS-IMUT-ORFA")).isEqualTo("2073-08-14");
    }

    @Test void receitaVindaDaPortoNaoPodeSerEditadaNemExcluidaPelaTelaDeReceitas() throws Exception {
        String token=login();
        long calendario=id(criar(token,"/api/porto/calendario","{\"dataPagamento\":\"2074-08-14\",\"competenciaInicio\":\"2074-07-01\",\"competenciaFim\":\"2074-07-15\",\"descricao\":\"Ciclo protegido\",\"ativo\":true}"));
        MockMultipartFile arquivo=new MockMultipartFile("arquivo","protegida.csv","text/csv",("""
            Número da Ordem de Serviço,Valor Total,Especialidade,Sigla da Viatura,Socorrista,QRA,Data de atendimento
            OS-PROTEGIDA-1,432.10,GUINCHO,,ALGUEM,QRA-PROTEGIDA,05/07/2074
            """).getBytes(StandardCharsets.UTF_8));
        long previa=id(mvc.perform(multipart("/api/porto/importacoes/previa").file(arquivo).header("Authorization","Bearer "+token))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        mvc.perform(post("/api/porto/importacoes/{id}/confirmar",previa).header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"numeroOrdemPagamento\":\"OP-PROTEGIDA\",\"calendarioPagamentoId\":"+calendario+"}"))
            .andExpect(status().isOk());
        long receita=jdbc.queryForObject("select r.id from receitas r join ordens_servico_porto os on os.id=r.ordem_servico_porto_id where os.numero='OS-PROTEGIDA-1'",Long.class);

        mvc.perform(put("/api/receitas/{id}",receita).header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"descricao":"Tentativa de mexer no valor","valor":1.00,"dataCompetencia":"2074-07-05",
                         "dataRecebimento":"2074-08-14","status":"RECEBIDA","recorrente":false}
                        """))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.detalhe").value("Receitas originadas da Porto ou de importação não podem ser alteradas manualmente."));
        mvc.perform(delete("/api/receitas/{id}",receita).header("Authorization","Bearer "+token))
            .andExpect(status().isBadRequest());

        assertThat(valorDaReceitaDa("OS-PROTEGIDA-1")).isEqualByComparingTo("432.10");
    }

    @Test void receitaManualSegueEditavelEExcluivel() throws Exception {
        String token=login();
        String criada=mvc.perform(post("/api/receitas").header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"descricao":"Fretamento avulso","valor":700.00,"dataCompetencia":"2074-09-01",
                         "dataRecebimento":"2074-09-02","status":"RECEBIDA","recorrente":false}
                        """))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        long receita=id(criada);

        mvc.perform(put("/api/receitas/{id}",receita).header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"descricao":"Fretamento avulso corrigido","valor":880.00,"dataCompetencia":"2074-09-01",
                         "dataRecebimento":"2074-09-02","status":"RECEBIDA","recorrente":false}
                        """))
            .andExpect(status().isOk()).andExpect(jsonPath("$.valor").value(880.00));
        mvc.perform(delete("/api/receitas/{id}",receita).header("Authorization","Bearer "+token))
            .andExpect(status().isNoContent());
    }

    private Long motoristaDa(String numeroOs){return jdbc.queryForObject("select motorista_id from ordens_servico_porto where numero=?",Long.class,numeroOs);}
    private Long idDaOs(String numeroOs){return jdbc.queryForObject("select id from ordens_servico_porto where numero=?",Long.class,numeroOs);}
    private BigDecimal valorDaOs(String numeroOs){return jdbc.queryForObject("select valor_total from ordens_servico_porto where numero=?",BigDecimal.class,numeroOs);}
    private BigDecimal valorDaReceitaDa(String numeroOs){return jdbc.queryForObject("select r.valor from receitas r join ordens_servico_porto os on os.id=r.ordem_servico_porto_id where os.numero=?",BigDecimal.class,numeroOs);}
    private BigDecimal valorDaContaDa(String numeroOs){return jdbc.queryForObject("select c.valor_previsto from contas_receber c join ordens_servico_porto os on os.id=c.ordem_servico_porto_id where os.numero=?",BigDecimal.class,numeroOs);}
    private Long motoristaDaReceitaDa(String numeroOs){return jdbc.queryForObject("select r.motorista_id from receitas r join ordens_servico_porto os on os.id=r.ordem_servico_porto_id where os.numero=?",Long.class,numeroOs);}
    private Long veiculoDaReceitaDa(String numeroOs){return jdbc.queryForObject("select r.veiculo_id from receitas r join ordens_servico_porto os on os.id=r.ordem_servico_porto_id where os.numero=?",Long.class,numeroOs);}
    private String dataRecebimentoDaReceitaDa(String numeroOs){return String.valueOf(jdbc.queryForObject("select r.data_recebimento from receitas r join ordens_servico_porto os on os.id=r.ordem_servico_porto_id where os.numero=?",java.sql.Date.class,numeroOs));}

    private long id(String json){ return ((Number)JsonPath.read(json,"$.id")).longValue(); }
    private String criar(String token,String caminho,String corpo) throws Exception {
        return mvc.perform(post(caminho).header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON).content(corpo))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
    }
    private String login() throws Exception {
        String corpo=mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"admin@fluxogestao.local\",\"senha\":\"Admin@123\"}"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(corpo,"$.token");
    }
}
