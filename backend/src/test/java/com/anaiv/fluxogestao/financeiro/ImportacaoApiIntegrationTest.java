package com.anaiv.fluxogestao.financeiro;

import com.jayway.jsonpath.JsonPath;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import java.io.ByteArrayOutputStream;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ImportacaoApiIntegrationTest {
    @Autowired MockMvc mvc;

    @Test
    void administradorConferePdfEConfirmaContasAReceberSemExtracaoFicticia() throws Exception {
        String token=login();
        long contratante=id(criar(token,"/api/contratantes","{\"nome\":\"Porto Seguro importação\"}"));
        byte[] pdf=pdfComTexto("Documento real de teste - protocolo no formato ainda nao mapeado");
        MockMultipartFile arquivo=new MockMultipartFile("arquivo","porto-julho.pdf","application/pdf",pdf);
        String importacao=mvc.perform(multipart("/api/importacoes").file(arquivo).header("Authorization","Bearer "+token))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.status").value("AGUARDANDO_CONFERENCIA"))
            .andExpect(jsonPath("$.totalRegistros").value(0))
            .andExpect(jsonPath("$.textoExtraido").value(org.hamcrest.Matchers.containsString("formato ainda nao mapeado")))
            .andReturn().getResponse().getContentAsString();
        long importacaoId=id(importacao);

        mvc.perform(multipart("/api/importacoes").file(arquivo).header("Authorization","Bearer "+token))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.detalhe").value("Este documento já foi importado."));

        mvc.perform(post("/api/importacoes/{id}/itens",importacaoId).header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON).content("""
                {"protocolo":"PS-PDF-01","dataServico":"2026-07-20","valor":450.00,
                 "previsaoPagamento":"2026-08-20","origem":"Fortaleza","destino":"Caucaia"}
                """))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.totalRegistros").value(1));

        mvc.perform(post("/api/importacoes/{id}/confirmar",importacaoId).header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"contratanteId\":"+contratante+"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CONFIRMADA"));

        mvc.perform(get("/api/contas-receber").header("Authorization","Bearer "+token).param("pesquisa","PS-PDF-01"))
            .andExpect(status().isOk()).andExpect(jsonPath("$[0].origem").value("IMPORTADA"))
            .andExpect(jsonPath("$[0].valorPrevisto").value(450.0))
            .andExpect(jsonPath("$[0].importacaoId").value(importacaoId));
    }

    private String login() throws Exception {
        String json=mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
            .content("{\"email\":\"admin@fluxogestao.local\",\"senha\":\"Admin@123\"}"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(json,"$.token");
    }
    private String criar(String token,String path,String body) throws Exception {
        return mvc.perform(post(path).header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
    }
    private long id(String json){return ((Number)JsonPath.read(json,"$.id")).longValue();}
    private byte[] pdfComTexto(String texto) throws Exception {
        try(PDDocument doc=new PDDocument();ByteArrayOutputStream out=new ByteArrayOutputStream()){
            PDPage page=new PDPage();doc.addPage(page);
            try(PDPageContentStream stream=new PDPageContentStream(doc,page)){
                stream.beginText();stream.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA),12);
                stream.newLineAtOffset(50,700);stream.showText(texto);stream.endText();
            }
            doc.save(out);return out.toByteArray();
        }
    }
}
