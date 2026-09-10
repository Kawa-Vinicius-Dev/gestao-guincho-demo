package com.anaiv.fluxogestao.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Trava tentativas de login por chave (IP, e-mail ou a combinacao dos dois) em memoria.
 * Vale para uma unica instancia do backend; se o servico escalar horizontalmente,
 * o estado precisa migrar para um armazenamento compartilhado (ex. Redis).
 */
@Component
public class LimitadorDeLogin {

    private record Estado(int tentativas, Instant janelaExpiraEm, Instant bloqueadoAte) {}

    private final ConcurrentHashMap<String, Estado> estados = new ConcurrentHashMap<>();
    private final int maxTentativas;
    private final Duration janela;
    private final Duration bloqueio;

    public LimitadorDeLogin(
            @Value("${app.security.login.max-tentativas:5}") int maxTentativas,
            @Value("${app.security.login.janela-minutos:15}") long janelaMinutos,
            @Value("${app.security.login.bloqueio-minutos:15}") long bloqueioMinutos
    ) {
        this.maxTentativas = maxTentativas;
        this.janela = Duration.ofMinutes(janelaMinutos);
        this.bloqueio = Duration.ofMinutes(bloqueioMinutos);
    }

    public boolean bloqueado(String chave) {
        Estado estado = estados.get(chave);
        return estado != null && estado.bloqueadoAte() != null && Instant.now().isBefore(estado.bloqueadoAte());
    }

    public void registrarFalha(String chave) {
        Instant agora = Instant.now();
        estados.compute(chave, (k, atual) -> {
            boolean janelaNova = atual == null || agora.isAfter(atual.janelaExpiraEm());
            int tentativas = janelaNova ? 1 : atual.tentativas() + 1;
            Instant janelaExpiraEm = janelaNova ? agora.plus(janela) : atual.janelaExpiraEm();
            Instant bloqueadoAte = tentativas >= maxTentativas ? agora.plus(bloqueio) : null;
            return new Estado(tentativas, janelaExpiraEm, bloqueadoAte);
        });
    }

    public void registrarSucesso(String chave) {
        estados.remove(chave);
    }
}
