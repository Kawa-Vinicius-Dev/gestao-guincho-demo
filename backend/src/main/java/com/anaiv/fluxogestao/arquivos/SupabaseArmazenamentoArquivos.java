package com.anaiv.fluxogestao.arquivos;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpRequest.BodyPublishers;
import java.net.http.HttpResponse;
import java.net.http.HttpResponse.BodyHandlers;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

/**
 * Usa a API HTTP do Supabase Storage diretamente (sem SDK): o projeto ja tem um Supabase
 * para o Postgres, entao o mesmo projeto guarda os arquivos, sem infraestrutura nova.
 * O bucket deve ser privado: o acesso sempre passa por URL assinada de curta duracao.
 */
@Component
@Profile("!test")
public class SupabaseArmazenamentoArquivos implements ArmazenamentoArquivos {

    private final HttpClient http = HttpClient.newHttpClient();
    private final ObjectMapper json = new ObjectMapper();
    private final String url;
    private final String chaveServico;
    private final String bucket;

    public SupabaseArmazenamentoArquivos(
            @Value("${app.storage.supabase.url:}") String url,
            @Value("${app.storage.supabase.service-role-key:}") String chaveServico,
            @Value("${app.storage.supabase.bucket:comprovantes}") String bucket
    ) {
        this.url = url;
        this.chaveServico = chaveServico;
        this.bucket = bucket;
    }

    @Override
    public String enviar(String caminho, byte[] conteudo, String contentType) {
        exigirConfiguracao();
        HttpRequest requisicao = HttpRequest.newBuilder(uriObjeto(caminho))
                .header("Authorization", "Bearer " + chaveServico)
                .header("apikey", chaveServico)
                .header("Content-Type", contentType)
                .header("x-upsert", "true")
                .POST(BodyPublishers.ofByteArray(conteudo))
                .build();
        enviar(requisicao, "Nao foi possivel enviar o arquivo para o armazenamento.");
        return caminho;
    }

    @Override
    public String urlTemporaria(String caminho, Duration validade) {
        exigirConfiguracao();
        HttpRequest requisicao = HttpRequest.newBuilder(uriAssinatura(caminho))
                .header("Authorization", "Bearer " + chaveServico)
                .header("apikey", chaveServico)
                .header("Content-Type", "application/json")
                .POST(BodyPublishers.ofString("{\"expiresIn\":" + validade.toSeconds() + "}", StandardCharsets.UTF_8))
                .build();
        HttpResponse<String> resposta = enviar(requisicao, "Nao foi possivel gerar o link do arquivo.");
        JsonNode corpo = json.readTree(resposta.body());
        String caminhoAssinado = corpo.get("signedURL").asText();
        return url + "/storage/v1" + caminhoAssinado;
    }

    @Override
    public void remover(String caminho) {
        exigirConfiguracao();
        HttpRequest requisicao = HttpRequest.newBuilder(URI.create(url + "/storage/v1/object/" + bucket))
                .header("Authorization", "Bearer " + chaveServico)
                .header("apikey", chaveServico)
                .header("Content-Type", "application/json")
                .method("DELETE", BodyPublishers.ofString("{\"prefixes\":[\"" + caminho + "\"]}", StandardCharsets.UTF_8))
                .build();
        enviar(requisicao, "Nao foi possivel remover o arquivo do armazenamento.");
    }

    @Override
    public byte[] baixar(String caminho) {
        exigirConfiguracao();
        HttpRequest requisicao = HttpRequest.newBuilder(uriObjeto(caminho))
                .header("Authorization", "Bearer " + chaveServico)
                .header("apikey", chaveServico)
                .GET()
                .build();
        return enviar(requisicao, BodyHandlers.ofByteArray(), "Nao foi possivel baixar o arquivo do armazenamento.").body();
    }

    private HttpResponse<String> enviar(HttpRequest requisicao, String mensagemDeErro) {
        return enviar(requisicao, BodyHandlers.ofString(), mensagemDeErro);
    }

    private <T> HttpResponse<T> enviar(HttpRequest requisicao, HttpResponse.BodyHandler<T> handler, String mensagemDeErro) {
        try {
            HttpResponse<T> resposta = http.send(requisicao, handler);
            if (resposta.statusCode() >= 300) {
                throw new IllegalStateException(mensagemDeErro + " (status " + resposta.statusCode() + ")");
            }
            return resposta;
        } catch (IOException e) {
            throw new IllegalStateException(mensagemDeErro, e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(mensagemDeErro, e);
        }
    }

    private URI uriObjeto(String caminho) {
        return URI.create(url + "/storage/v1/object/" + bucket + "/" + caminho);
    }

    private URI uriAssinatura(String caminho) {
        return URI.create(url + "/storage/v1/object/sign/" + bucket + "/" + caminho);
    }

    private void exigirConfiguracao() {
        if (url.isBlank() || chaveServico.isBlank()) {
            throw new IllegalStateException(
                    "Armazenamento de arquivos nao configurado. Defina SUPABASE_STORAGE_URL e SUPABASE_STORAGE_SERVICE_ROLE_KEY.");
        }
    }
}
