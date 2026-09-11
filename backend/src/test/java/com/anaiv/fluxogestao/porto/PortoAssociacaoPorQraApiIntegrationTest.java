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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * A associacao e feita so pelo QRA - nunca pelo nome, porque a equipe tem nomes quase iguais (pai e
 * filho). QRA cadastrado vincula; QRA desconhecido nao cria cadastro nenhum, vira atribuicao manual.
 * A viatura vem do cadastro do socorrista, porque a Porto nunca preenche a sigla da viatura.
 */
@SpringBootTest @AutoConfigureMockMvc @ActiveProfiles("test")
class PortoAssociacaoPorQraApiIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    @Test void associaSomentePeloQraELevaAViaturaDoSocorristaParaOFinanceiro() throws Exception {
        String token=login();
        long veiculo=id(criar(token,"/api/veiculos","{\"identificacao\":\"VTR-QRA-01\",\"placa\":\"QRA1A01\",\"modelo\":\"Guincho\",\"custoPorKm\":1.00}"));
        // mesma pessoa no papel, dois QRAs: sao dois cadastros distintos
        long comMatricula=id(criar(token,"/api/motoristas","{\"nome\":\"CARLOS ALBERTO TESTE\",\"qra\":\"770001\",\"veiculoId\":"+veiculo+"}"));
        long comIdInterno=id(criar(token,"/api/motoristas","{\"nome\":\"CARLOS ALBERTO TESTE\",\"qra\":\"003XX0000QRA0001\",\"veiculoId\":"+veiculo+"}"));
        assertThat(comMatricula).isNotEqualTo(comIdInterno);

        long calendario=id(criar(token,"/api/porto/calendario","{\"dataPagamento\":\"2071-08-14\",\"competenciaInicio\":\"2071-07-01\",\"competenciaFim\":\"2071-07-15\",\"descricao\":\"Ciclo QRA\",\"ativo\":true}"));
        MockMultipartFile arquivo=new MockMultipartFile("arquivo","qra.txt","text/plain",("""
            Número da Ordem de Serviço\tValor Total\tEspecialidade\tSigla da Viatura\tSocorrista\tQRA\tData de atendimento
            OS-QRA-MATRICULA\t100.00\tGUINCHO\t\tCARLOS ALBERTO TESTE\t770001\t05/07/2071
            OS-QRA-IDINTERNO\t200.00\tGUINCHO\t\tCARLOS ALBERTO TESTE\t003XX0000QRA0001\t06/07/2071
            OS-QRA-DESCONHECIDO\t300.00\tGUINCHO\t\tCARLOS ALBERTO TESTE\t999999\t07/07/2071
            OS-QRA-VAZIO\t400.00\tGUINCHO\t\t\t\t08/07/2071
            """).getBytes(StandardCharsets.UTF_8));
        long previa=((Number)JsonPath.read(mvc.perform(multipart("/api/porto/importacoes/previa").file(arquivo)
            .header("Authorization","Bearer "+token)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(),"$.id")).longValue();
        mvc.perform(post("/api/porto/importacoes/{id}/confirmar",previa).header("Authorization","Bearer "+token)
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"numeroOrdemPagamento\":\"OP-QRA-TESTE\",\"calendarioPagamentoId\":"+calendario
                +",\"confirmarDivergencias\":true,\"confirmarReassociacoes\":true}")).andExpect(status().isOk());

        // cada QRA cai no seu proprio cadastro, mesmo com nome identico
        assertThat(motoristaDa("OS-QRA-MATRICULA")).isEqualTo(comMatricula);
        assertThat(motoristaDa("OS-QRA-IDINTERNO")).isEqualTo(comIdInterno);
        // QRA desconhecido nao cria cadastro: seria a mesma pessoa duplicada, com a comissao dividida
        assertThat(motoristaDa("OS-QRA-DESCONHECIDO")).isNull();
        assertThat(jdbc.queryForObject("select count(*) from motoristas where qra='999999'",Integer.class)).isZero();
        // sem QRA tambem nao ha identidade: as duas excecoes sobram para atribuicao manual
        assertThat(motoristaDa("OS-QRA-VAZIO")).isNull();

        // a viatura do socorrista chega ao lancamento financeiro, mesmo sem sigla no arquivo
        assertThat(veiculoDaContaDa("OS-QRA-MATRICULA")).isEqualTo(veiculo);
        assertThat(veiculoDaContaDa("OS-QRA-IDINTERNO")).isEqualTo(veiculo);
        // sem socorrista nao ha viatura para levar ao financeiro
        assertThat(veiculoDaContaDa("OS-QRA-DESCONHECIDO")).isNull();
    }

    private Long motoristaDa(String numeroOs){
        return jdbc.queryForObject("select motorista_id from ordens_servico_porto where numero=?",Long.class,numeroOs);
    }
    private Long veiculoDaContaDa(String numeroOs){
        return jdbc.queryForObject("select c.veiculo_id from contas_receber c join ordens_servico_porto os on os.id=c.ordem_servico_porto_id where os.numero=?",Long.class,numeroOs);
    }
    private long id(String json){ return ((Number)JsonPath.read(json,"$.id")).longValue(); }
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
