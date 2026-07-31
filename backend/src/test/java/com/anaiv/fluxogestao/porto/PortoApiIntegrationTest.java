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
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PortoApiIntegrationTest {
    @Autowired JdbcTemplate jdbc;
    @Autowired MockMvc mvc;

    @Test
    void migrationCriaDominioPorto() {
        Integer tabelas = jdbc.queryForObject("""
            select count(*) from information_schema.tables
            where table_schema = 'public' and table_name in (
              'ordens_pagamento_porto', 'ordens_servico_porto',
              'pendencias_financeiras_porto', 'registros_importados_porto')
            """, Integer.class);
        assertThat(tabelas).isEqualTo(4);
    }

    @Test
    void endpointsPortoExigemAutenticacao() throws Exception {
        MockMultipartFile arquivo=new MockMultipartFile("arquivo","porto.csv","text/csv","A;B\n1;2".getBytes(StandardCharsets.UTF_8));
        mvc.perform(multipart("/api/porto/importacoes/previa").file(arquivo)).andExpect(status().isUnauthorized());
    }

    @Test
    void importaRelatoriosIdempotentesEPreservaRecebimentoManual() throws Exception {
        String token=login();
        long previaOp=previa(token,"op.csv","""
            Número da Ordem de Pagamento;Valor Total do Serviço;Nome: Código;Data de Pagamento
            <b>OP-900</b>;1.500,00;Porto: C900;15/08/2026
            """);
        mvc.perform(get("/api/porto/ordens-pagamento").header("Authorization","Bearer "+token))
            .andExpect(status().isOk()).andExpect(jsonPath("$").isEmpty());
        mvc.perform(post("/api/porto/importacoes/{id}/confirmar",previaOp).header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.importados").value(1));
        String ops=mvc.perform(get("/api/porto/ordens-pagamento").header("Authorization","Bearer "+token))
            .andExpect(status().isOk()).andExpect(jsonPath("$[0].situacao").value("PROGRAMADO"))
            .andReturn().getResponse().getContentAsString();
        long opId=((Number)JsonPath.read(ops,"$[0].id")).longValue();

        long previaOs=previa(token,"os.csv","""
            Número da Ordem de Serviço,Valor Total,Especialidade,Sigla da Viatura,Socorrista,QRA,Data de atendimento
            <span>OS-901</span>,700.00,REMOÇÃO,,Ana,QRA-1,2026-07-30
            OS-902,300.00,PANE,VTR-2,Bruno,QRA-2,2026-07-30
            """);
        mvc.perform(post("/api/porto/importacoes/{id}/confirmar",previaOs).header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detalhe").value(org.hamcrest.Matchers.containsString("OP")));
        mvc.perform(post("/api/porto/importacoes/{id}/confirmar",previaOs).header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"ordemPagamentoId\":"+opId+"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.importados").value(2));

        long repetida=previa(token,"os-repetida.csv","""
            Número da Ordem de Serviço,Valor Total,Especialidade,Sigla da Viatura,Socorrista,QRA,Data de atendimento
            <span>OS-901</span>,700.00,REMOÇÃO,,Ana,QRA-1,2026-07-30

            """);
        mvc.perform(post("/api/porto/importacoes/{id}/confirmar",repetida).header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"ordemPagamentoId\":"+opId+"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.importados").value(0)).andExpect(jsonPath("$.ignorados").value(1));

        long atualizacao=previa(token,"os-atualizada.csv","""
            Número da Ordem de Serviço,Valor Total,Especialidade,Sigla da Viatura,Socorrista,QRA,Data de atendimento
            OS-901,700.00,,,Ana,QRA-2,2026-07-30
            """);
        mvc.perform(post("/api/porto/importacoes/{id}/confirmar",atualizacao).header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"ordemPagamentoId\":"+opId+"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.importados").value(1));
        mvc.perform(get("/api/porto/ordens-servico").header("Authorization","Bearer "+token))
            .andExpect(status().isOk()).andExpect(jsonPath("$[0].especialidade").value("REMOÇÃO"))
            .andExpect(jsonPath("$[0].qra").value("QRA-2")).andExpect(jsonPath("$[0].viatura").doesNotExist());

        Integer despesasAntes=jdbc.queryForObject("select count(*) from despesas",Integer.class);
        long devolucao=previa(token,"devolvidos.csv","""
            Número da Ordem de Serviço\tEspecialidade\tData de Atendimento\tData da devolução\tValor Total
            OS-901\t\t30/07/2026\t31/07/2026\t700,00
            """);
        mvc.perform(post("/api/porto/importacoes/{id}/confirmar",devolucao).header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.importados").value(1));
        mvc.perform(get("/api/porto/pendencias").header("Authorization","Bearer "+token))
            .andExpect(status().isOk()).andExpect(jsonPath("$[?(@.tipo == 'SERVICO_DEVOLVIDO')]").isNotEmpty());
        assertThat(jdbc.queryForObject("select count(*) from despesas",Integer.class)).isEqualTo(despesasAntes);

        mvc.perform(patch("/api/porto/ordens-pagamento/{id}/receber",opId).header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"valorRecebido\":1490.00,\"dataRecebimento\":\"2026-08-16\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.situacao").value("RECEBIDO"));
    }

    private long previa(String token,String nome,String csv) throws Exception {
        MockMultipartFile arquivo=new MockMultipartFile("arquivo",nome,"text/csv",csv.getBytes(StandardCharsets.UTF_8));
        String json=mvc.perform(multipart("/api/porto/importacoes/previa").file(arquivo).header("Authorization","Bearer "+token))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.linhas").isNotEmpty())
            .andReturn().getResponse().getContentAsString();
        return ((Number)JsonPath.read(json,"$.id")).longValue();
    }
    private String login() throws Exception {
        String json=mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
            .content("{\"email\":\"admin@fluxogestao.local\",\"senha\":\"Admin@123\"}"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(json,"$.token");
    }
}
