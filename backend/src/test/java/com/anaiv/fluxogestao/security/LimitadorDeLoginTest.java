package com.anaiv.fluxogestao.security;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class LimitadorDeLoginTest {

    @Test
    void bloqueiaAposAtingirOMaximoDeTentativas() {
        LimitadorDeLogin limitador = new LimitadorDeLogin(3, 15, 15);
        String chave = "192.0.2.1";

        assertThat(limitador.bloqueado(chave)).isFalse();
        limitador.registrarFalha(chave);
        limitador.registrarFalha(chave);
        assertThat(limitador.bloqueado(chave)).isFalse();
        limitador.registrarFalha(chave);
        assertThat(limitador.bloqueado(chave)).isTrue();
    }

    @Test
    void sucessoLimpaOHistoricoDeFalhas() {
        LimitadorDeLogin limitador = new LimitadorDeLogin(2, 15, 15);
        String chave = "192.0.2.2";

        limitador.registrarFalha(chave);
        limitador.registrarSucesso(chave);
        limitador.registrarFalha(chave);
        assertThat(limitador.bloqueado(chave)).isFalse();
    }

    @Test
    void janelaExpiradaReiniciaAContagem() throws InterruptedException {
        LimitadorDeLogin limitador = new LimitadorDeLogin(2, 0, 15);
        String chave = "192.0.2.3";

        limitador.registrarFalha(chave);
        Thread.sleep(5);
        limitador.registrarFalha(chave);
        assertThat(limitador.bloqueado(chave)).isFalse();
    }

    @Test
    void chavesDiferentesNaoInterferemEntreSi() {
        LimitadorDeLogin limitador = new LimitadorDeLogin(1, 15, 15);

        limitador.registrarFalha("192.0.2.4");
        assertThat(limitador.bloqueado("192.0.2.4")).isTrue();
        assertThat(limitador.bloqueado("192.0.2.5")).isFalse();
    }
}
