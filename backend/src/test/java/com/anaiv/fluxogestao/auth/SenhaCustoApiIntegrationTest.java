package com.anaiv.fluxogestao.auth;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * O custo do BCrypt fica gravado dentro do hash, entao baixar o fator na configuracao nao acelera
 * quem ja tem senha cadastrada. O login precisa regravar o hash para a mudanca valer.
 */
@SpringBootTest @AutoConfigureMockMvc @ActiveProfiles("test")
class SenhaCustoApiIntegrationTest {
    private static final String EMAIL="custo.bcrypt@local.test";
    private static final String SENHA="Custo@123";
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    @Test void loginRegravaHashAntigoComOFatorDeTrabalhoAtual() throws Exception {
        jdbc.update("delete from usuarios where email=?",EMAIL);
        jdbc.update("insert into usuarios (nome,email,senha_hash,perfil,ativo) values (?,?,?,?,?)",
            "Custo BCrypt",EMAIL,new BCryptPasswordEncoder(12).encode(SENHA),"ADMINISTRADOR",true);
        assertThat(hashSalvo()).startsWith("$2a$12$");

        entrar().andExpect(status().isOk());

        assertThat(hashSalvo())
            .describedAs("o hash antigo deveria ter sido regravado com o fator atual")
            .startsWith("$2a$10$");

        entrar().andExpect(status().isOk());
        assertThat(hashSalvo()).startsWith("$2a$10$");
        jdbc.update("delete from sessoes where usuario_id=(select id from usuarios where email=?)",EMAIL);
        jdbc.update("delete from usuarios where email=?",EMAIL);
    }

    private org.springframework.test.web.servlet.ResultActions entrar() throws Exception {
        return mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
            .content("{\"email\":\"%s\",\"senha\":\"%s\"}".formatted(EMAIL,SENHA)));
    }

    private String hashSalvo() {
        return jdbc.queryForObject("select senha_hash from usuarios where email=?",String.class,EMAIL);
    }
}
