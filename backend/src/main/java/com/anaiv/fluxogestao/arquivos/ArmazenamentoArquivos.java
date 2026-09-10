package com.anaiv.fluxogestao.arquivos;

import java.time.Duration;

/**
 * Um arquivo enviado por usuario (ex.: comprovante de despesa) precisa sobreviver a um
 * redeploy do backend. Disco local do servidor nao serve para isso: implementacoes devem
 * gravar em algo fora do processo da aplicacao.
 */
public interface ArmazenamentoArquivos {

    /** Envia o conteudo para o caminho informado e devolve a chave de armazenamento. */
    String enviar(String caminho, byte[] conteudo, String contentType);

    /** Gera uma URL temporaria para baixar o arquivo, valida pelo tempo informado. */
    String urlTemporaria(String caminho, Duration validade);

    /** Remove o arquivo. Nao falha se o arquivo ja nao existir. */
    void remover(String caminho);
}
