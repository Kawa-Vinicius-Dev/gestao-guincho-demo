package com.anaiv.fluxogestao.arquivos;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Substitui o Supabase Storage nos testes: guarda os bytes em memoria, sem rede.
 * Cobre o mesmo contrato que a producao usa, sem depender de credenciais reais.
 */
@Component
@Profile("test")
public class ArmazenamentoArquivosEmMemoria implements ArmazenamentoArquivos {

    private final Map<String, byte[]> arquivos = new ConcurrentHashMap<>();

    @Override
    public String enviar(String caminho, byte[] conteudo, String contentType) {
        arquivos.put(caminho, conteudo);
        return caminho;
    }

    @Override
    public String urlTemporaria(String caminho, Duration validade) {
        if (!arquivos.containsKey(caminho)) {
            throw new IllegalStateException("Arquivo não encontrado no armazenamento de teste: " + caminho);
        }
        return "memoria://" + caminho;
    }

    @Override
    public void remover(String caminho) {
        arquivos.remove(caminho);
    }
}
