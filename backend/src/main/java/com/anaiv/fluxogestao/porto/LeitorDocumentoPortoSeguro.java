package com.anaiv.fluxogestao.porto;

public interface LeitorDocumentoPortoSeguro {
    ResultadoLeitura ler(byte[] conteudo);
    record ResultadoLeitura(String texto, boolean requerOcr) {}
}
