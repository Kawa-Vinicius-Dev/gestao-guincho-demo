package com.anaiv.fluxogestao.porto;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.nio.charset.StandardCharsets;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * O resolvedor de QRA so roda durante a importacao. Sem o religamento, cadastrar ou corrigir o QRA
 * de um socorrista depois que o relatorio ja entrou nao surtia efeito: as OS daquele QRA ficavam
 * orfas para sempre, e cada uma delas e comissao que a pessoa nao recebe.
 */
@SpringBootTest @AutoConfigureMockMvc @ActiveProfiles("test")
class PortoReligarOrfasDoQraApiIntegrationTest {
    @Autowired MockMvc mvc;

    @Test
    void cadastrarOQraDepoisDaImportacaoAdotaAsOsQueEstavamOrfas() throws Exception {
        String token=login();
        long calendario=calendario(token,"2091-08-14","2091-07-01","2091-07-15");

        // Chega o relatorio com um QRA que ainda nao existe no cadastro.
        importar(token,"""
            Número da Ordem de Serviço\tValor Total\tEspecialidade\tSigla da Viatura\tSocorrista\tQRA\tData de atendimento
            OS-ORFA-A\t150.00\tGUINCHO\t\tDJALMA BEZERRA DE MELO\t991001\t05/07/2091
            OS-ORFA-B\t250.00\tGUINCHO\t\tDJALMA BEZERRA DE MELO\t991001\t06/07/2091
            OS-DE-OUTRO\t900.00\tGUINCHO\t\tOUTRA PESSOA\t889999\t07/07/2091
            ""","OP-ORFAS",calendario);

        semSocorrista(token,"OS-ORFA-A");
        semSocorrista(token,"OS-ORFA-B");

        // Agora a pessoa e cadastrada com aquele QRA - era aqui que nada acontecia.
        long djalma=criarSocorrista(token,"DJALMA BEZERRA DE MELO","991001");

        comSocorrista(token,"OS-ORFA-A",djalma);
        comSocorrista(token,"OS-ORFA-B",djalma);
        // O religamento e restrito ao QRA cadastrado: nao encosta em OS de outro.
        semSocorrista(token,"OS-DE-OUTRO");
    }

    @Test
    void corrigirUmQraErradoTambemAdotaAsOrfas() throws Exception {
        String token=login();
        long calendario=calendario(token,"2092-08-14","2092-07-01","2092-07-15");
        importar(token,"""
            Número da Ordem de Serviço\tValor Total\tEspecialidade\tSigla da Viatura\tSocorrista\tQRA\tData de atendimento
            OS-QRA-CORRIGIDO\t180.00\tGUINCHO\t\tEDUARDO MARTINS\t991777\t05/07/2092
            ""","OP-CORRIGIDO",calendario);

        // Cadastrado com o QRA trocado: a OS continua orfa, porque o numero nao bate.
        long eduardo=criarSocorrista(token,"EDUARDO MARTINS DA SILVA","991778");
        semSocorrista(token,"OS-QRA-CORRIGIDO");

        mvc.perform(put("/api/motoristas/{id}",eduardo).header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\"EDUARDO MARTINS DA SILVA\",\"qra\":\"991777\"}"))
            .andExpect(status().isOk());

        comSocorrista(token,"OS-QRA-CORRIGIDO",eduardo);
    }

    private void semSocorrista(String token,String numero) throws Exception {
        mvc.perform(get("/api/porto/ordens-servico").param("numeroOs",numero)
                .header("Authorization","Bearer "+token))
            .andExpect(jsonPath("$[0].motoristaId").doesNotExist());
    }
    private void comSocorrista(String token,String numero,long motoristaId) throws Exception {
        mvc.perform(get("/api/porto/ordens-servico").param("numeroOs",numero)
                .header("Authorization","Bearer "+token))
            .andExpect(jsonPath("$[0].motoristaId").value(motoristaId));
    }
    private long criarSocorrista(String token,String nome,String qra) throws Exception {
        String resposta=mvc.perform(post("/api/motoristas").header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\""+nome+"\",\"qra\":\""+qra+"\"}"))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return ((Number)JsonPath.read(resposta,"$.id")).longValue();
    }
    private void importar(String token,String conteudo,String numeroOp,long calendario) throws Exception {
        MockMultipartFile arquivo=new MockMultipartFile("arquivo","os.txt","text/plain",conteudo.getBytes(StandardCharsets.UTF_8));
        long previa=((Number)JsonPath.read(mvc.perform(multipart("/api/porto/importacoes/previa").file(arquivo)
            .header("Authorization","Bearer "+token)).andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString(),"$.id")).longValue();
        mvc.perform(post("/api/porto/importacoes/{id}/confirmar",previa).header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"numeroOrdemPagamento\":\""+numeroOp+"\",\"calendarioPagamentoId\":"+calendario
                    +",\"confirmarDivergencias\":true,\"confirmarReassociacoes\":true}"))
            .andExpect(status().isOk());
    }
    private long calendario(String token,String pagamento,String inicio,String fim) throws Exception {
        String resposta=mvc.perform(post("/api/porto/calendario").header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"dataPagamento\":\""+pagamento+"\",\"competenciaInicio\":\""+inicio+"\",\"competenciaFim\":\""+fim
                    +"\",\"descricao\":\"Ciclo religamento\",\"ativo\":true}"))
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
