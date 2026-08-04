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
              'pendencias_financeiras_porto', 'registros_importados_porto',
              'justificativas_conciliacao_porto')
            """, Integer.class);
        assertThat(tabelas).isEqualTo(5);
        Integer colunasOs = jdbc.queryForObject("""
            select count(*) from information_schema.columns
            where table_schema = 'public' and table_name = 'ordens_servico_porto'
              and column_name in ('status_operacional', 'status_financeiro', 'origem_importacao',
                                  'data_importacao', 'data_devolucao', 'data_finalizacao_devolucao')
            """, Integer.class);
        assertThat(colunasOs).isEqualTo(6);
    }

    @Test
    void endpointsPortoExigemAutenticacao() throws Exception {
        MockMultipartFile arquivo=new MockMultipartFile("arquivo","porto.csv","text/csv","A;B\n1;2".getBytes(StandardCharsets.UTF_8));
        mvc.perform(multipart("/api/porto/importacoes/previa").file(arquivo)).andExpect(status().isUnauthorized());
    }

    @Test
    void retomaCancelaEReabrePreviaDoMesmoArquivo() throws Exception {
        String token=login();
        String csv="""
            Número da Ordem de Pagamento;Valor Total do Serviço;Nome: Código;Data de Pagamento
            OP-CICLO-1;250,00;Sintético: Ciclo;31/08/2026
            """;
        long primeira=previa(token,"ciclo.csv",csv);
        long retomada=previa(token,"ciclo.csv",csv);
        assertThat(retomada).isEqualTo(primeira);
        assertThat(jdbc.queryForObject("select count(*) from ordens_pagamento_porto where numero='OP-CICLO-1'",Integer.class)).isZero();

        mvc.perform(post("/api/porto/importacoes/{id}/cancelar",primeira).header("Authorization","Bearer "+token))
            .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CANCELADA"));
        mvc.perform(post("/api/porto/importacoes/{id}/cancelar",primeira).header("Authorization","Bearer "+token))
            .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CANCELADA"));

        long reaberta=previa(token,"ciclo.csv",csv);
        assertThat(reaberta).isEqualTo(primeira);
        assertThat(jdbc.queryForObject("select status from importacoes where id=?",String.class,primeira)).isEqualTo("AGUARDANDO_CONFERENCIA");
    }

    @Test
    void confirmacaoPortoEhIdempotente() throws Exception {
        String token=login();
        long id=previa(token,"idempotente.csv","""
            Número da Ordem de Pagamento;Valor Total do Serviço;Nome: Código;Data de Pagamento
            OP-IDEMP-1;300,00;Sintético: Idempotente;31/08/2026
            """);
        mvc.perform(post("/api/porto/importacoes/{id}/confirmar",id).header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isOk());
        mvc.perform(post("/api/porto/importacoes/{id}/confirmar",id).header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isOk());
        assertThat(jdbc.queryForObject("select count(*) from ordens_pagamento_porto where numero='OP-IDEMP-1'",Integer.class)).isEqualTo(1);
    }

    @Test
    void bloqueiaTodaConfirmacaoQuandoExisteLinhaComErro() throws Exception {
        String token=login();
        String json=previaJson(token,"erros.csv","""
            Número da Ordem de Pagamento;Valor Total do Serviço;Nome: Código;Data de Pagamento
            OP-VALIDA-BLOQUEADA;125,00;Sintético: Válida;31/08/2026
            OP-INVALIDA-BLOQUEADA;;Sintético: Inválida;31/08/2026
            """);
        long id=((Number)JsonPath.read(json,"$.id")).longValue();
        assertThat((String)JsonPath.read(json,"$.linhas[1].acao")).isEqualTo("ERRO");

        mvc.perform(post("/api/porto/importacoes/{id}/confirmar",id).header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detalhe").value(org.hamcrest.Matchers.containsString("corrija")));
        assertThat(jdbc.queryForObject("select count(*) from ordens_pagamento_porto where numero in ('OP-VALIDA-BLOQUEADA','OP-INVALIDA-BLOQUEADA')",Integer.class)).isZero();
    }

    @Test
    void devolucaoDeOsNovaExigeEspecialidadeEDataDeAtendimento() throws Exception {
        String token=login();
        String json=previaJson(token,"devolucao-incompleta.csv","""
            Número da Ordem de Serviço;Especialidade;Data de Atendimento;Data da devolução;Valor Total
            OS-DEV-NOVA-1;Pane;;31/08/2026;420,00
            """);
        assertThat((String)JsonPath.read(json,"$.linhas[0].acao")).isEqualTo("ERRO");
        assertThat((String)JsonPath.read(json,"$.linhas[0].mensagem")).contains("data de atendimento");
    }

    @Test
    void exigeConfirmacaoExplicitaParaReassociarOsERecalculaAsOps() throws Exception {
        String token=login();
        long opA=importarOp(token,"OP-REASSOC-A", "1.000,00");
        long opB=importarOp(token,"OP-REASSOC-B", "800,00");
        String csv="""
            Número da Ordem de Serviço,Valor Total,Especialidade,Sigla da Viatura,Socorrista,QRA,Data de atendimento
            OS-REASSOC-1,300.00,REMOÇÃO,,,,2026-08-01
            """;

        long id=previa(token,"os-reassociar.csv",csv);
        mvc.perform(post("/api/porto/importacoes/{id}/avaliar",id).header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"ordemPagamentoId\":"+opA+"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.linhas[0].acao").value("IMPORTAR"));
        mvc.perform(post("/api/porto/importacoes/{id}/confirmar",id).header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"ordemPagamentoId\":"+opA+"}"))
            .andExpect(status().isOk());

        long reaberta=previa(token,"os-reassociar.csv",csv);
        assertThat(reaberta).isEqualTo(id);
        mvc.perform(post("/api/porto/importacoes/{id}/avaliar",reaberta).header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"ordemPagamentoId\":"+opB+"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.linhas[0].acao").value("DIVERGENCIA"));
        mvc.perform(post("/api/porto/importacoes/{id}/confirmar",reaberta).header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"ordemPagamentoId\":"+opB+"}"))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detalhe").value(org.hamcrest.Matchers.containsString("divergência")));
        mvc.perform(get("/api/porto/ordens-servico").header("Authorization","Bearer "+token))
            .andExpect(status().isOk()).andExpect(jsonPath("$[?(@.numero == 'OS-REASSOC-1')].ordemPagamento",org.hamcrest.Matchers.contains("OP-REASSOC-A")));

        mvc.perform(post("/api/porto/importacoes/{id}/confirmar",reaberta).header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"ordemPagamentoId\":"+opB+",\"confirmarDivergencias\":true}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.importados").value(1));
        String ops=mvc.perform(get("/api/porto/ordens-pagamento").header("Authorization","Bearer "+token))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        java.util.List<java.util.Map<String,Object>> resumoA=JsonPath.read(ops,"$[?(@.numero == 'OP-REASSOC-A')]");
        java.util.List<java.util.Map<String,Object>> resumoB=JsonPath.read(ops,"$[?(@.numero == 'OP-REASSOC-B')]");
        assertThat(resumoA.getFirst()).containsEntry("quantidadeOrdensServico",0).containsEntry("valorOrdensServico",0);
        assertThat(((Number)resumoA.getFirst().get("divergencia")).doubleValue()).isEqualTo(1000.0);
        assertThat(resumoB.getFirst()).containsEntry("quantidadeOrdensServico",1).containsEntry("valorOrdensServico",300.0);
        assertThat(((Number)resumoB.getFirst().get("divergencia")).doubleValue()).isEqualTo(500.0);
        mvc.perform(get("/api/porto/ordens-servico").header("Authorization","Bearer "+token))
            .andExpect(status().isOk()).andExpect(jsonPath("$[?(@.numero == 'OS-REASSOC-1')].ordemPagamento",org.hamcrest.Matchers.contains("OP-REASSOC-B")));
    }

    @Test
    void importaRelatoriosIdempotentesEPreservaRecebimentoManual() throws Exception {
        String token=login();
        long previaOp=previa(token,"op.csv","""
            Número da Ordem de Pagamento;Valor Total do Serviço;Nome: Código;Data de Pagamento
            <b>OP-900</b>;1.500,00;Porto: C900;15/08/2026
            """);
        mvc.perform(get("/api/porto/ordens-pagamento").header("Authorization","Bearer "+token))
            .andExpect(status().isOk()).andExpect(jsonPath("$[?(@.numero == 'OP-900')]").isEmpty());
        mvc.perform(post("/api/porto/importacoes/{id}/confirmar",previaOp).header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.importados").value(1));
        String ops=mvc.perform(get("/api/porto/ordens-pagamento").header("Authorization","Bearer "+token))
            .andExpect(status().isOk()).andExpect(jsonPath("$[0].situacao").value("PROGRAMADO"))
            .andReturn().getResponse().getContentAsString();
        long opId=((Number)JsonPath.read(ops,"$[0].id")).longValue();

        long previaOs=previa(token,"os.csv","""
            Número da Ordem de Serviço,Valor Total,Especialidade,Sigla da Viatura,Socorrista,QRA,Data de atendimento
            <span>OS-901</span>,700.00,REMOÇÃO,VTR-1,Ana,QRA-1,2026-07-30
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
            <span>OS-901</span>,700.00,REMOÇÃO,VTR-1,Ana,QRA-1,2026-07-30

            """);
        mvc.perform(post("/api/porto/importacoes/{id}/confirmar",repetida).header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"ordemPagamentoId\":"+opId+"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.importados").value(0)).andExpect(jsonPath("$.ignorados").value(1));

        long atualizacao=previa(token,"os-atualizada.csv","""
            Número da Ordem de Serviço,Valor Total,Especialidade,Sigla da Viatura,Socorrista,QRA,Data de atendimento
            OS-901,700.00,REMOÇÃO,,Ana,QRA-2,2026-07-30
            """);
        mvc.perform(post("/api/porto/importacoes/{id}/confirmar",atualizacao).header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"ordemPagamentoId\":"+opId+",\"confirmarDivergencias\":true}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.importados").value(1));
        mvc.perform(get("/api/porto/ordens-servico").header("Authorization","Bearer "+token))
            .andExpect(status().isOk()).andExpect(jsonPath("$[0].especialidade").value("REMOÇÃO"))
            .andExpect(jsonPath("$[0].qra").value("QRA-2")).andExpect(jsonPath("$[0].viatura").value("VTR-1"));

        Integer despesasAntes=jdbc.queryForObject("select count(*) from despesas",Integer.class);
        long devolucao=previa(token,"devolvidos.csv","""
            Número da Ordem de Serviço\tEspecialidade\tData de Atendimento\tData da devolução\tValor Total
            OS-901\t\t30/07/2026\t31/07/2026\t700,00
            """);
        mvc.perform(post("/api/porto/importacoes/{id}/confirmar",devolucao).header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.importados").value(1));
        mvc.perform(get("/api/porto/pendencias").header("Authorization","Bearer "+token))
            .andExpect(status().isOk()).andExpect(jsonPath("$[?(@.tipo == 'SERVICO_DEVOLVIDO')]").isEmpty());
        assertThat(jdbc.queryForObject("select status_operacional from ordens_servico_porto where numero='OS-901'",String.class))
            .isEqualTo("DEVOLVIDO_FINALIZADO");
        assertThat(jdbc.queryForObject("select count(*) from despesas",Integer.class)).isEqualTo(despesasAntes);

        mvc.perform(patch("/api/porto/ordens-pagamento/{id}/receber",opId).header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"valorRecebido\":1490.00,\"dataRecebimento\":\"2026-08-16\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.situacao").value("RECEBIDO"));
    }

    private long previa(String token,String nome,String csv) throws Exception {
        String json=previaJson(token,nome,csv);
        return ((Number)JsonPath.read(json,"$.id")).longValue();
    }
    private String previaJson(String token,String nome,String csv) throws Exception {
        MockMultipartFile arquivo=new MockMultipartFile("arquivo",nome,"text/csv",csv.getBytes(StandardCharsets.UTF_8));
        return mvc.perform(multipart("/api/porto/importacoes/previa").file(arquivo).header("Authorization","Bearer "+token))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.linhas").isNotEmpty())
            .andReturn().getResponse().getContentAsString();
    }
    private long importarOp(String token,String numero,String valor) throws Exception {
        long id=previa(token,numero+".csv","""
            Número da Ordem de Pagamento;Valor Total do Serviço;Nome: Código;Data de Pagamento
            %s;%s;Sintético: Reassociação;31/08/2026
            """.formatted(numero,valor));
        mvc.perform(post("/api/porto/importacoes/{id}/confirmar",id).header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isOk());
        String ops=mvc.perform(get("/api/porto/ordens-pagamento").header("Authorization","Bearer "+token))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        java.util.List<java.util.Map<String,Object>> encontrada=JsonPath.read(ops,"$[?(@.numero == '"+numero+"')]");
        return ((Number)encontrada.getFirst().get("id")).longValue();
    }
    private String login() throws Exception {
        String json=mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
            .content("{\"email\":\"admin@fluxogestao.local\",\"senha\":\"Admin@123\"}"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(json,"$.token");
    }
}
