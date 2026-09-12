package com.anaiv.fluxogestao.porto;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * A mesma OS aparece com numero diferente em cada tela da Porto. Se a normalizacao errar,
 * o relatorio financeiro cria uma OS duplicada em vez de completar a que o painel diario
 * cadastrou - e o valor do servico entra duas vezes no fechamento.
 */
class OrdemServicoPortoNumeroTest {

    @Test
    void numeroDoPainelDiarioEDoRelatorioFinanceiroViramAMesmaChave() {
        assertThat(OrdemServicoPorto.normalizar("5632135/26"))
            .isEqualTo(OrdemServicoPorto.normalizar("01/5632135-26"))
            .isEqualTo("563213526");
    }

    @Test
    void prefixoDoRelatorioFinanceiroNaoEntraNaChave() {
        // 01, 04 e 05 aparecem nos dados reais; e formatacao do relatorio, nao identidade.
        assertThat(OrdemServicoPorto.normalizar("04/2947448-26")).isEqualTo("294744826");
        assertThat(OrdemServicoPorto.normalizar("05/3102450-26")).isEqualTo("310245026");
    }

    @Test
    void numeroQueNaoSegueNenhumDosDoisFormatosFicaSemChave() {
        // Sem chave, a OS so casa por numero exato: melhor duas OS separadas para conferencia
        // do que juntar por palpite dois servicos que podem ser de socorristas diferentes.
        assertThat(OrdemServicoPorto.normalizar("OS-EXP-001")).isNull();
        assertThat(OrdemServicoPorto.normalizar("123/45")).isNull();
        assertThat(OrdemServicoPorto.normalizar("")).isNull();
        assertThat(OrdemServicoPorto.normalizar(null)).isNull();
    }

    @Test
    void espacoEmVoltaNaoImpedeOReconhecimento() {
        assertThat(OrdemServicoPorto.normalizar("  5632135/26  ")).isEqualTo("563213526");
    }

    @Test
    void construtorJaGravaAChaveEORenumerarAtualiza() {
        var os=new OrdemServicoPorto("5632135/26",null);
        assertThat(os.getNumeroNormalizado()).isEqualTo("563213526");

        os.renumerar("01/5632135-26");
        assertThat(os.getNumero()).isEqualTo("01/5632135-26");
        assertThat(os.getNumeroNormalizado()).isEqualTo("563213526");
    }
}
