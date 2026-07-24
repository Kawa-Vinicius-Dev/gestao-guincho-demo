package com.anaiv.fluxogestao.service;

public interface LeitorDocumentoPortoSeguro {
    ResultadoLeitura ler(byte[] conteudo);
    record ResultadoLeitura(String texto, boolean requerOcr) {}
}
