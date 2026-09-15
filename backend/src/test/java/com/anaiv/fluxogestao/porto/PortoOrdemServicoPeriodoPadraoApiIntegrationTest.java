package com.anaiv.fluxogestao.porto;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * A tela de ordens de servico carregava a tabela inteira. Ela passa a abrir num mes so: o mes
 * corrente quando ja tem servico lancado e, caso contrario, o mes do servico mais recente, para
 * nao abrir vazia quando o movimento do mes ainda nao comecou.
 */
@SpringBootTest @AutoConfigureMockMvc @ActiveProfiles("test")
class PortoOrdemServicoPeriodoPadraoApiIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    @AfterEach void limpar(){
        jdbc.update("delete from ordens_servico_porto where numero like 'OS-PADRAO-%'");
    }

    @Test void usaOMesCorrenteQuandoEleJaTemServico() throws Exception {
        LocalDate hoje=LocalDate.now();
        inserir("OS-PADRAO-HOJE",hoje);

        String periodo=periodoPadrao();
        assertThat((String)JsonPath.read(periodo,"$.dataInicio")).isEqualTo(hoje.withDayOfMonth(1).toString());
        assertThat((String)JsonPath.read(periodo,"$.dataFim")).isEqualTo(hoje.withDayOfMonth(hoje.lengthOfMonth()).toString());
    }

    @Test void semServicoNoMesCorrenteCaiNoMesDoServicoMaisRecente() throws Exception {
        // Esta regra so existe quando o mes corrente esta vazio, e o teste precisa
        // garantir isso: quatro classes da suite gravam servico em setembro de
        // 2026 — que virou "o mes corrente" pela data em que a suite roda — e
        // nenhuma limpa. Rodando junto, este teste nunca via o mes vazio.
        esvaziarMesCorrente();

        // O endpoint cai no mes do servico MAIS RECENTE da base inteira, entao o
        // teste tambem precisa ser dono desse servico: varios outros gravam OS
        // com data no futuro, e o resultado dependia de quem rodou antes.
        LocalDate maiorJaGravada=jdbc.queryForObject(
            "select coalesce(max(data_atendimento),current_date) from ordens_servico_porto",LocalDate.class);
        LocalDate maisRecente=maiorJaGravada.plusDays(1);
        LocalDate hoje=LocalDate.now();
        // A premissa do teste e nao haver servico no mes corrente.
        if(maisRecente.getMonth()==hoje.getMonth()&&maisRecente.getYear()==hoje.getYear())
            maisRecente=maisRecente.plusMonths(1);
        inserir("OS-PADRAO-ANTIGA",maisRecente);

        String periodo=periodoPadrao();
        assertThat((String)JsonPath.read(periodo,"$.dataInicio")).isEqualTo(maisRecente.withDayOfMonth(1).toString());
        assertThat((String)JsonPath.read(periodo,"$.dataFim")).isEqualTo(maisRecente.withDayOfMonth(maisRecente.lengthOfMonth()).toString());
    }

    @Test void listagemRespeitaOIntervaloInformado() throws Exception {
        inserir("OS-PADRAO-DENTRO",LocalDate.of(2074,3,10));
        inserir("OS-PADRAO-FORA",LocalDate.of(2074,4,10));

        mvc.perform(get("/api/porto/ordens-servico").param("dataInicio","2074-03-01").param("dataFim","2074-03-31")
                .param("numeroOs","OS-PADRAO").header("Authorization","Bearer "+login()))
            .andExpect(status().isOk())
            .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.length()").value(1))
            .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$[0].numero").value("OS-PADRAO-DENTRO"));
    }

    /**
     * Apaga os servicos do mes corrente e o que depende deles.
     *
     * E dado de teste: cada teste grava o seu antes de assertar, entao nada aqui
     * pertence a outro. As quatro tabelas sao as que referenciam a OS por chave
     * estrangeira — apagar so a OS falharia.
     */
    private void esvaziarMesCorrente(){
        LocalDate inicio=LocalDate.now().withDayOfMonth(1);
        LocalDate fim=inicio.plusMonths(1).minusDays(1);
        String doMes="select id from ordens_servico_porto where data_atendimento between ? and ?";
        for(String dependente:List.of(
                "delete from receitas where ordem_servico_porto_id in ("+doMes+")",
                "delete from contas_receber where ordem_servico_porto_id in ("+doMes+")",
                "delete from pendencias_financeiras_porto where ordem_servico_id in ("+doMes+")",
                "delete from historico_porto where ordem_servico_id in ("+doMes+")")) {
            jdbc.update(dependente,inicio,fim);
        }
        jdbc.update("delete from ordens_servico_porto where data_atendimento between ? and ?",inicio,fim);
    }

    private void inserir(String numero,LocalDate data){
        jdbc.update("insert into ordens_servico_porto (numero,valor_total,especialidade,data_atendimento) values (?,?,?,?)",
            numero,new java.math.BigDecimal("100.00"),"GUINCHO",java.sql.Date.valueOf(data));
    }
    private String periodoPadrao() throws Exception {
        return mvc.perform(get("/api/porto/ordens-servico/periodo-padrao").header("Authorization","Bearer "+login()))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    }
    private String login() throws Exception {
        return JsonPath.read(mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
            .content("{\"email\":\"admin@fluxogestao.local\",\"senha\":\"Admin@123\"}"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(),"$.token");
    }
}
