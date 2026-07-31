package com.anaiv.fluxogestao.porto;

import com.anaiv.fluxogestao.entity.EnumsFinanceiros.TipoRelatorioPorto;
import com.anaiv.fluxogestao.service.PortoCsvParser;
import org.junit.jupiter.api.Test;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;

class PortoCsvParserTest {
    private final PortoCsvParser parser = new PortoCsvParser();

    @Test
    void detectaPrevisaoUtf8ComBomPontoEVirgulaEHtml() throws Exception {
        byte[] original = recurso("previsao-receber-utf8.csv");
        byte[] comBom = new byte[original.length + 3];
        comBom[0]=(byte)0xEF; comBom[1]=(byte)0xBB; comBom[2]=(byte)0xBF;
        System.arraycopy(original,0,comBom,3,original.length);
        var previa = parser.parse(comBom);
        assertThat(previa.tipo()).isEqualTo(TipoRelatorioPorto.PREVISAO_RECEBER);
        assertThat(previa.linhas()).hasSize(1);
        assertThat(previa.linhas().getFirst().texto("numero_op")).isEqualTo("OP-100");
        assertThat(previa.linhas().getFirst().decimal("valor_total")).isEqualByComparingTo("1234.56");
        assertThat(previa.linhas().getFirst().data("data_pagamento")).hasToString("2026-07-31");
    }

    @Test
    void detectaOsComVirgulaDataIsoEVeiculoVazio() throws Exception {
        var previa=parser.parse(recurso("os-vinculadas.csv"));
        assertThat(previa.tipo()).isEqualTo(TipoRelatorioPorto.OS_VINCULADAS);
        assertThat(previa.linhas().getFirst().texto("numero_os")).isEqualTo("OS-200");
        assertThat(previa.linhas().getFirst().texto("sigla_viatura")).isNull();
        assertThat(previa.linhas().getFirst().data("data_atendimento")).hasToString("2026-07-30");
    }

    @Test
    void detectaDevolvidosComTabulacaoEIso88591() {
        String csv="Número da Ordem de Serviço\tEspecialidade\tData de Atendimento\tData da devolução\tValor Total\nOS-ISO\tRemoção\t30/07/2026\t31/07/2026\t500,00";
        var previa=parser.parse(csv.getBytes(StandardCharsets.ISO_8859_1));
        assertThat(previa.tipo()).isEqualTo(TipoRelatorioPorto.SERVICOS_DEVOLVIDOS);
        assertThat(previa.linhas().getFirst().texto("especialidade")).isEqualTo("Remoção");
        assertThat(previa.linhas().getFirst().hashRegistro()).hasSize(64);
    }

    @Test
    void rejeitaCabecalhosDesconhecidos() {
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> parser.parse("A;B\n1;2".getBytes(StandardCharsets.UTF_8)))
            .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("relatório Porto");
    }

    @Test
    void marcaValorVazioEDataInvalidaComoErroSemDescartarLinhas() {
        var previa=parser.parse("""
            Número da Ordem de Pagamento;Valor Total do Serviço;Nome: Código;Data de Pagamento
            OP-ERRO-VALOR;;Sintético: Valor;31/08/2026
            OP-ERRO-DATA;100,00;Sintético: Data;31/02/2026
            """.getBytes(StandardCharsets.UTF_8));
        assertThat(previa.linhas()).hasSize(2);
        assertThat(previa.linhas()).allMatch(linha->linha.acao().name().equals("ERRO"));
        assertThat(previa.erros()).hasSize(2);
    }

    @Test
    void aceitaCamposOpcionaisVaziosEmOsVinculada() throws Exception {
        var previa=parser.parse(recurso("os-vinculadas.csv"));
        assertThat(previa.linhas().getFirst().acao().name()).isEqualTo("IMPORTAR");
        assertThat(previa.erros()).isEmpty();
    }

    private byte[] recurso(String nome) throws Exception {
        try(InputStream in=getClass().getResourceAsStream("/porto/"+nome)){return in.readAllBytes();}
    }
}
