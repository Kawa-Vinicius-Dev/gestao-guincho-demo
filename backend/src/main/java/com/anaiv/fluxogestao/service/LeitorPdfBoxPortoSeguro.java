package com.anaiv.fluxogestao.service;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.stereotype.Component;

@Component
public class LeitorPdfBoxPortoSeguro implements LeitorDocumentoPortoSeguro {
    @Override
    public ResultadoLeitura ler(byte[] conteudo) {
        try (var documento = Loader.loadPDF(conteudo)) {
            String texto = new PDFTextStripper().getText(documento).trim();
            return new ResultadoLeitura(texto, texto.isBlank());
        } catch (Exception e) {
            throw new IllegalArgumentException("O PDF não pôde ser lido. Verifique se o arquivo não está protegido ou corrompido.");
        }
    }
}
