package com.anaiv.fluxogestao.porto;

import com.anaiv.fluxogestao.arquivos.ArmazenamentoArquivos;
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
 * A avaliacao roda a cada tecla digitada no numero da OP. Sem cache ela baixava
 * o arquivo do Storage e reparseava tudo de novo em cada uma: num relatorio de
 * centenas de linhas a tela ficava presa em "validando" enquanto se digitava.
 *
 * O arquivo e imutavel enquanto a importacao existir, entao a leitura crua vale
 * ser guardada. Este teste remove o objeto do armazenamento depois da previa:
 * se a avaliacao ainda responde, e porque nao foi ao Storage.
 *
 * Confirmar continua lendo do Storage de proposito — e essa leitura que impede
 * confirmar uma importacao cujo arquivo sumiu.
 */
@SpringBootTest @AutoConfigureMockMvc @ActiveProfiles("test")
class PortoAvaliacaoSemRelerApiIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired ArmazenamentoArquivos armazenamento;

    @Test void avaliacoesSeguidasNaoVoltamAoArmazenamento() throws Exception {
        String token=login();
        long calendario=id(criar(token,"/api/porto/calendario",
            "{\"dataPagamento\":\"2066-08-14\",\"competenciaInicio\":\"2066-07-16\",\"competenciaFim\":\"2066-07-31\",\"descricao\":\"Ciclo sem reler\",\"ativo\":true}"));
        MockMultipartFile arquivo=new MockMultipartFile("arquivo","sem-reler.txt","text/plain",("""
            Número da Ordem de Serviço\tValor Total\tEspecialidade\tSigla da Viatura\tSocorrista\tQRA\tData de atendimento
            OS-SEM-RELER-1\t100.00\tGUINCHO\t\tFULANO\t660001\t20/07/2066
            OS-SEM-RELER-2\t200.00\tGUINCHO\t\tFULANO\t660001\t21/07/2066
            """).getBytes(StandardCharsets.UTF_8));
        long previa=id(mvc.perform(multipart("/api/porto/importacoes/previa").file(arquivo)
            .header("Authorization","Bearer "+token)).andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString());

        // Primeira avaliacao: ainda com o arquivo no lugar, enche o cache.
        avaliar(token,previa,calendario).andExpect(status().isOk());

        // O arquivo some do armazenamento. Quem for ao Storage agora falha.
        String caminho=jdbc.queryForObject("select caminho_arquivo from importacoes where id=?",String.class,previa);
        armazenamento.remover(caminho);

        // Digitar o numero da OP dispara varias avaliacoes: nenhuma pode depender do arquivo.
        for(int tecla=0;tecla<4;tecla++) avaliar(token,previa,calendario).andExpect(status().isOk());

        // E a confirmacao, que le do Storage, acusa a falta — a garantia antiga segue de pe.
        mvc.perform(post("/api/porto/importacoes/{id}/confirmar",previa).header("Authorization","Bearer "+token)
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"numeroOrdemPagamento\":\"OP-SEM-RELER\",\"calendarioPagamentoId\":"+calendario
                +",\"confirmarDivergencias\":true,\"confirmarReassociacoes\":true}"))
            .andExpect(status().isBadRequest());
    }

    private org.springframework.test.web.servlet.ResultActions avaliar(String token,long previa,long calendario) throws Exception {
        return mvc.perform(post("/api/porto/importacoes/{id}/avaliar",previa).header("Authorization","Bearer "+token)
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"numeroOrdemPagamento\":\"OP-SEM-RELER\",\"calendarioPagamentoId\":"+calendario+"}"));
    }
    private long id(String json){ return ((Number)JsonPath.read(json,"$.id")).longValue(); }
    private String criar(String token,String caminho,String corpo) throws Exception {
        return mvc.perform(post(caminho).header("Authorization","Bearer "+token)
            .contentType(MediaType.APPLICATION_JSON).content(corpo))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
    }
    private String login() throws Exception {
        return JsonPath.read(mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
            .content("{\"email\":\"admin@fluxogestao.local\",\"senha\":\"Admin@123\"}"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(),"$.token");
    }
}
