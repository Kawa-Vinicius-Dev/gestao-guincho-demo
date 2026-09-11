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

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * O operacional precisa juntar as OS orfas para dizer de quem e cada uma. O filtro tem de ser
 * resolvido no servidor: filtrar em memoria so alcancaria o mes carregado na tela, escondendo as
 * orfas dos meses anteriores.
 */
@SpringBootTest @AutoConfigureMockMvc @ActiveProfiles("test")
class PortoOrdemServicoSemSocorristaFiltroApiIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    @AfterEach void limpar(){
        jdbc.update("delete from ordens_servico_porto where numero like 'OS-FILTRO-%'");
        jdbc.update("delete from motoristas where qra='770777'");
    }

    @Test void filtraAsOsSemSocorristaEmQualquerMes() throws Exception {
        String token=login();
        long motorista=((Number)JsonPath.read(mvc.perform(post("/api/motoristas").header("Authorization","Bearer "+token)
            .contentType(MediaType.APPLICATION_JSON).content("{\"nome\":\"SOCORRISTA FILTRO\",\"qra\":\"770777\"}"))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(),"$.id")).longValue();

        inserir("OS-FILTRO-COM-DONO","2077-03-10",motorista);
        inserir("OS-FILTRO-ORFA-MARCO","2077-03-11",null);
        inserir("OS-FILTRO-ORFA-ABRIL","2077-04-12",null);

        // sem recorte de data, o filtro alcanca as orfas de meses diferentes
        List<String> orfas=JsonPath.read(listar(token,"semSocorrista=true&numeroOs=OS-FILTRO"),"$[*].numero");
        assertThat(orfas).containsExactlyInAnyOrder("OS-FILTRO-ORFA-MARCO","OS-FILTRO-ORFA-ABRIL");

        // o inverso tambem serve, para conferir o que ja foi atribuido
        List<String> comDono=JsonPath.read(listar(token,"semSocorrista=false&numeroOs=OS-FILTRO"),"$[*].numero");
        assertThat(comDono).containsExactly("OS-FILTRO-COM-DONO");

        // combinado com periodo, restringe ao mes pedido
        List<String> orfasDeMarco=JsonPath.read(
            listar(token,"semSocorrista=true&numeroOs=OS-FILTRO&dataInicio=2077-03-01&dataFim=2077-03-31"),"$[*].numero");
        assertThat(orfasDeMarco).containsExactly("OS-FILTRO-ORFA-MARCO");

        // sem o filtro, continua trazendo todas
        List<String> todas=JsonPath.read(listar(token,"numeroOs=OS-FILTRO"),"$[*].numero");
        assertThat(todas).hasSize(3);

        // semQra nao se confunde com semSocorrista: a OS sem QRA que ja tem dono continua aparecendo
        inserir("OS-FILTRO-SEM-QRA-SEM-DONO","2077-04-13",null);
        jdbc.update("insert into ordens_servico_porto (numero,valor_total,especialidade,qra,data_atendimento,motorista_id) values (?,?,?,?,?,?)",
            "OS-FILTRO-SEM-QRA-COM-DONO",new java.math.BigDecimal("100.00"),"GUINCHO",null,java.sql.Date.valueOf("2077-05-14"),motorista);
        jdbc.update("insert into ordens_servico_porto (numero,valor_total,especialidade,qra,data_atendimento) values (?,?,?,?,?)",
            "OS-FILTRO-QRA-DESCONHECIDO",new java.math.BigDecimal("100.00"),"GUINCHO","999999",java.sql.Date.valueOf("2077-05-15"));

        List<String> semQra=JsonPath.read(listar(token,"semQra=true&numeroOs=OS-FILTRO-SEM-QRA"),"$[*].numero");
        assertThat(semQra).containsExactlyInAnyOrder("OS-FILTRO-SEM-QRA-SEM-DONO","OS-FILTRO-SEM-QRA-COM-DONO");

        // QRA desconhecido tem valor preenchido: nao e "sem QRA", mesmo sem motorista vinculado
        List<String> qraDesconhecidoSemQra=JsonPath.read(listar(token,"semQra=true&numeroOs=OS-FILTRO-QRA-DESCONHECIDO"),"$[*].numero");
        assertThat(qraDesconhecidoSemQra).isEmpty();
    }

    private void inserir(String numero,String data,Long motorista){
        jdbc.update("insert into ordens_servico_porto (numero,valor_total,especialidade,data_atendimento,motorista_id) values (?,?,?,?,?)",
            numero,new java.math.BigDecimal("100.00"),"GUINCHO",java.sql.Date.valueOf(data),motorista);
    }
    private String listar(String token,String consulta) throws Exception {
        return mvc.perform(get("/api/porto/ordens-servico?"+consulta).header("Authorization","Bearer "+token))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    }
    private String login() throws Exception {
        return JsonPath.read(mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
            .content("{\"email\":\"admin@fluxogestao.local\",\"senha\":\"Admin@123\"}"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(),"$.token");
    }
}
