package com.anaiv.fluxogestao.porto;

import com.anaiv.fluxogestao.entity.EnumsFinanceiros.TipoRelatorioPorto;
import com.anaiv.fluxogestao.service.PortoBlocosParser;
import org.junit.jupiter.api.Test;
import java.nio.charset.StandardCharsets;
import static org.assertj.core.api.Assertions.assertThat;

class PortoBlocosParserTest {
    private final PortoBlocosParser parser=new PortoBlocosParser();

    @Test
    void separaBlocosELeDataHoraEValorBrasileiro() {
        var previa=parser.parse("""
            01/0000001-26
            PRESTADOR SINTÉTICO
            31/07/2026 10:30
            PORTO SEGURO CIA DE SEGUROS GERAIS
            GUINCHO
            CLIENTE SINTÉTICO
            ABC1D23
            123.456
            SOCORRISTA SINTÉTICO
            R$ 1.181,50
            Aguardando Lançamento

            01/0000002-26
            PRESTADOR SINTÉTICO
            01/08/2026 08:15
            SEGURADORA SINTÉTICA
            PANE
            CLIENTE SINTÉTICO 2
            DEF4G56
            R$ 200,00
            Aguardando Lançamento
            """.getBytes(StandardCharsets.UTF_8));

        assertThat(previa.tipo()).isEqualTo(TipoRelatorioPorto.SERVICOS_AGUARDANDO_LANCAMENTO);
        assertThat(previa.linhas()).hasSize(2);
        assertThat(previa.linhas().getFirst().texto("numero_os")).isEqualTo("01/0000001-26");
        assertThat(previa.linhas().getFirst().decimal("valor_total")).isEqualByComparingTo("1181.50");
        assertThat(previa.linhas().getFirst().dataHora("data_atendimento").toLocalDateTime()).hasToString("2026-07-31T10:30");
        assertThat(previa.linhas().getFirst().texto("qra")).isEqualTo("123.456");
        assertThat(previa.linhas().getFirst().texto("socorrista")).isEqualTo("SOCORRISTA SINTÉTICO");
        assertThat(previa.linhas().get(1).texto("qra")).isNull();
        assertThat(previa.linhas().get(1).texto("socorrista")).isNull();
    }

    @Test
    void rejeitaBlocoIncompletoSemDeslocarCampos() {
        var previa=parser.parse("""
            01/0000003-26
            PRESTADOR SINTÉTICO
            31/07/2026 10:30
            PORTO SEGURO
            GUINCHO
            CLIENTE SINTÉTICO
            ABC1D23
            Aguardando Lançamento
            """.getBytes(StandardCharsets.UTF_8));
        assertThat(previa.linhas().getFirst().acao().name()).isEqualTo("ERRO");
        assertThat(previa.erros().getFirst()).contains("valor");
    }
}
