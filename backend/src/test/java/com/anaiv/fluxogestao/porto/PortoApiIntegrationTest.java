package com.anaiv.fluxogestao.porto;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@ActiveProfiles("test")
class PortoApiIntegrationTest {
    @Autowired JdbcTemplate jdbc;

    @Test
    void migrationCriaDominioPorto() {
        Integer tabelas = jdbc.queryForObject("""
            select count(*) from information_schema.tables
            where table_schema = 'public' and table_name in (
              'ordens_pagamento_porto', 'ordens_servico_porto',
              'pendencias_financeiras_porto', 'registros_importados_porto')
            """, Integer.class);
        assertThat(tabelas).isEqualTo(4);
    }
}
