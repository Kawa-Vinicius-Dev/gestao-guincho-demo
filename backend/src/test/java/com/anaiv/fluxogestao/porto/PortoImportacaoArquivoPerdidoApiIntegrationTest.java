package com.anaiv.fluxogestao.porto;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.AfterEach;
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
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * A confirmacao rele o arquivo gravado em disco. No Render o disco e efemero: se o processo
 * reinicia entre a previa e a confirmacao, o arquivo some. Reenviar o mesmo arquivo caia no
 * registro antigo pelo hash e nao regravava nada, entao aquele arquivo nunca mais podia ser
 * importado. O teste apaga o arquivo de proposito para reproduzir isso.
 */
@SpringBootTest
@AutoConfigureMockMvc @ActiveProfiles("test")
class PortoImportacaoArquivoPerdidoApiIntegrationTest {
    private static final String CSV="""
        Número da Ordem de Serviço,Valor Total,Especialidade,Sigla da Viatura,Socorrista,QRA,Data de atendimento
        OS-PERDIDA-001,150.00,GUINCHO,,SOCORRISTA PERDIDO,QRA-PERDIDO,2092-04-11
        """;
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    @AfterEach void limpar(){
        jdbc.update("delete from registros_importados_porto where importacao_id in (select id from importacoes where nome_arquivo='arquivo-perdido.csv')");
        jdbc.update("delete from ordens_servico_porto where numero like 'OS-PERDIDA-%'");
        jdbc.update("delete from importacoes where nome_arquivo='arquivo-perdido.csv'");
    }

    @Test void reenviarOArquivoDepoisDeOProcessoPerderODiscoVoltaAFuncionar() throws Exception {
        String token=login();
        long id=previa(token);
        Path caminho=Path.of(jdbc.queryForObject("select caminho_arquivo from importacoes where id=?",String.class,id));
        assertThat(caminho).exists();

        Files.delete(caminho);
        mvc.perform(post("/api/porto/importacoes/{id}/confirmar",id).header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"numeroOrdemPagamento\":\"OP-PERDIDA\",\"calendarioPagamentoId\":1}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.detalhe").value("Não foi possível reler o relatório Porto."));

        long reenviada=previa(token);
        assertThat(reenviada).isEqualTo(id);
        assertThat(caminho).exists();
        assertThat(Files.readString(caminho,StandardCharsets.UTF_8)).contains("OS-PERDIDA-001");
    }

    private long previa(String token) throws Exception {
        MockMultipartFile arquivo=new MockMultipartFile("arquivo","arquivo-perdido.csv","text/csv",CSV.getBytes(StandardCharsets.UTF_8));
        String corpo=mvc.perform(multipart("/api/porto/importacoes/previa").file(arquivo).header("Authorization","Bearer "+token))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return ((Number)JsonPath.read(corpo,"$.id")).longValue();
    }

    private String login() throws Exception {
        String resposta=mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"admin@fluxogestao.local\",\"senha\":\"Admin@123\"}"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(resposta,"$.token");
    }
}
