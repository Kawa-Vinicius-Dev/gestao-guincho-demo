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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Socorrista sai da equipe, mas nao sai da historia: as OS que ele atendeu continuam dele, e a
 * comissao daquele periodo continua para conferir. Desativar so impede vinculo novo.
 */
@SpringBootTest
@AutoConfigureMockMvc @ActiveProfiles("test")
class EquipeCadastroApiIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    @Test void socorristaCadastradoPodeSerCorrigido() throws Exception {
        String token=login();
        long veiculo=id(criar(token,"/api/veiculos","{\"identificacao\":\"VTR-EDIT-1\",\"placa\":\"EDT1A23\",\"modelo\":\"Guincho\",\"custoPorKm\":1.50}"));
        long socorrista=id(criar(token,"/api/motoristas","{\"nome\":\"Nome Digitado Errado\",\"telefone\":\"(85) 90000-0000\",\"qra\":\"QRA-EDIT-1\"}"));

        mvc.perform(put("/api/motoristas/{id}",socorrista).header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\"Nome Correto\",\"telefone\":\"(85) 98888-7777\",\"qra\":\"QRA-EDIT-9\",\"veiculoId\":"+veiculo+"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.nome").value("Nome Correto"))
            .andExpect(jsonPath("$.telefone").value("(85) 98888-7777"))
            .andExpect(jsonPath("$.qra").value("QRA-EDIT-9"))
            .andExpect(jsonPath("$.veiculoId").value(veiculo))
            .andExpect(jsonPath("$.ativo").value(true));
    }

    @Test void qraDeOutroSocorristaNaoPodeSerRoubadoNaEdicao() throws Exception {
        String token=login();
        long primeiro=id(criar(token,"/api/motoristas","{\"nome\":\"Dono do QRA\",\"qra\":\"QRA-DISPUTADO\"}"));
        long segundo=id(criar(token,"/api/motoristas","{\"nome\":\"Outro Socorrista\",\"qra\":\"QRA-PROPRIO\"}"));

        mvc.perform(put("/api/motoristas/{id}",segundo).header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\"Outro Socorrista\",\"qra\":\"QRA-DISPUTADO\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.detalhe").value("Já existe um socorrista com este QRA."));

        // manter o proprio QRA numa edicao continua valendo
        mvc.perform(put("/api/motoristas/{id}",segundo).header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\"Outro Socorrista Corrigido\",\"qra\":\"QRA-PROPRIO\"}"))
            .andExpect(status().isOk());
        assertThat(jdbc.queryForObject("select qra from motoristas where id=?",String.class,primeiro)).isEqualTo("QRA-DISPUTADO");
    }

    @Test void desativarPreservaHistoricoEImpedeNovosVinculos() throws Exception {
        String token=login();
        long socorrista=id(criar(token,"/api/motoristas","{\"nome\":\"Socorrista Que Saiu\",\"qra\":\"QRA-SAIU\"}"));
        long calendario=id(criar(token,"/api/porto/calendario","{\"dataPagamento\":\"2075-08-14\",\"competenciaInicio\":\"2075-07-01\",\"competenciaFim\":\"2075-07-15\",\"descricao\":\"Ciclo da saida\",\"ativo\":true}"));
        importar(token,"antes-da-saida.csv","OS-SAIU-ANTES,500.00,GUINCHO,,SOCORRISTA QUE SAIU,QRA-SAIU,05/07/2075","OP-SAIU-1",calendario);
        assertThat(motoristaDa("OS-SAIU-ANTES")).isEqualTo(socorrista);

        mvc.perform(patch("/api/motoristas/{id}/desativar",socorrista).header("Authorization","Bearer "+token))
            .andExpect(status().isOk()).andExpect(jsonPath("$.ativo").value(false));

        // continua no banco, e a OS antiga continua dele
        assertThat(jdbc.queryForObject("select count(*) from motoristas where id=?",Integer.class,socorrista)).isOne();
        assertThat(motoristaDa("OS-SAIU-ANTES")).isEqualTo(socorrista);
        // e a comissao do periodo em que ele trabalhou continua conferivel
        mvc.perform(get("/api/comissoes/resumo").header("Authorization","Bearer "+token)
                .param("calendarioPagamentoId",String.valueOf(calendario)).param("motoristaId",String.valueOf(socorrista)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].quantidadeServicosPagos").value(1))
            .andExpect(jsonPath("$[0].comissaoBruta").value(100.00));

        // a partir daqui, nenhum vinculo novo: nem pela importacao, nem na mao
        importar(token,"depois-da-saida.csv","OS-SAIU-DEPOIS,300.00,GUINCHO,,SOCORRISTA QUE SAIU,QRA-SAIU,06/07/2075","OP-SAIU-2",calendario);
        assertThat(motoristaDa("OS-SAIU-DEPOIS")).isNull();
        mvc.perform(patch("/api/porto/ordens-servico/{id}/motorista",idDaOs("OS-SAIU-DEPOIS")).header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"motoristaId\":"+socorrista+"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.detalhe").value("Este socorrista está desativado e não pode receber novos vínculos."));

        // reativar devolve o socorrista a operacao
        mvc.perform(patch("/api/motoristas/{id}/reativar",socorrista).header("Authorization","Bearer "+token))
            .andExpect(status().isOk()).andExpect(jsonPath("$.ativo").value(true));
        mvc.perform(patch("/api/porto/ordens-servico/{id}/motorista",idDaOs("OS-SAIU-DEPOIS")).header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"motoristaId\":"+socorrista+"}"))
            .andExpect(status().isOk());
    }

    @Test void reimportarUmaOsAntigaNaoApagaOSocorristaQueJaSaiu() throws Exception {
        String token=login();
        long socorrista=id(criar(token,"/api/motoristas","{\"nome\":\"Socorrista Historico\",\"qra\":\"QRA-HISTORICO\"}"));
        long calendario=id(criar(token,"/api/porto/calendario","{\"dataPagamento\":\"2076-08-14\",\"competenciaInicio\":\"2076-07-01\",\"competenciaFim\":\"2076-07-15\",\"descricao\":\"Ciclo historico\",\"ativo\":true}"));
        importar(token,"historico-1.csv","OS-HISTORICO,400.00,GUINCHO,,SOCORRISTA HISTORICO,QRA-HISTORICO,05/07/2076","OP-HISTORICO",calendario);
        assertThat(motoristaDa("OS-HISTORICO")).isEqualTo(socorrista);

        mvc.perform(patch("/api/motoristas/{id}/desativar",socorrista).header("Authorization","Bearer "+token)).andExpect(status().isOk());

        // a Porto reenvia a mesma OS com um dado corrigido: a linha e processada de novo
        MockMultipartFile csv=new MockMultipartFile("arquivo","historico-2.csv","text/csv",("""
            Número da Ordem de Serviço,Valor Total,Especialidade,Sigla da Viatura,Socorrista,QRA,Data de atendimento
            OS-HISTORICO,400.00,REMOÇÃO,,SOCORRISTA HISTORICO,QRA-HISTORICO,05/07/2076
            """).getBytes(StandardCharsets.UTF_8));
        long previa=id(mvc.perform(multipart("/api/porto/importacoes/previa").file(csv).header("Authorization","Bearer "+token))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        mvc.perform(post("/api/porto/importacoes/{id}/confirmar",previa).header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"numeroOrdemPagamento\":\"OP-HISTORICO\",\"calendarioPagamentoId\":"+calendario+",\"confirmarDivergencias\":true}"))
            .andExpect(status().isOk());

        // o dado mudou, mas quem atendeu continua sendo quem atendeu
        assertThat(jdbc.queryForObject("select especialidade from ordens_servico_porto where numero='OS-HISTORICO'",String.class)).isEqualTo("REMOÇÃO");
        assertThat(motoristaDa("OS-HISTORICO")).isEqualTo(socorrista);
    }

    private void importar(String token,String arquivo,String linha,String numeroOp,long calendario) throws Exception {
        MockMultipartFile csv=new MockMultipartFile("arquivo",arquivo,"text/csv",
            ("Número da Ordem de Serviço,Valor Total,Especialidade,Sigla da Viatura,Socorrista,QRA,Data de atendimento\n"+linha+"\n")
                .getBytes(StandardCharsets.UTF_8));
        long previa=id(mvc.perform(multipart("/api/porto/importacoes/previa").file(csv).header("Authorization","Bearer "+token))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        mvc.perform(post("/api/porto/importacoes/{id}/confirmar",previa).header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"numeroOrdemPagamento\":\""+numeroOp+"\",\"calendarioPagamentoId\":"+calendario+"}"))
            .andExpect(status().isOk());
    }
    private Long motoristaDa(String numeroOs){return jdbc.queryForObject("select motorista_id from ordens_servico_porto where numero=?",Long.class,numeroOs);}
    private Long idDaOs(String numeroOs){return jdbc.queryForObject("select id from ordens_servico_porto where numero=?",Long.class,numeroOs);}
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
