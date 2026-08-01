package com.anaiv.fluxogestao.config;

import com.anaiv.fluxogestao.entity.*;
import com.anaiv.fluxogestao.repository.CategoriaRepository;
import com.anaiv.fluxogestao.repository.UsuarioRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.password.PasswordEncoder;
import static com.anaiv.fluxogestao.entity.EnumsFinanceiros.TipoCategoria.*;

@Configuration
public class DadosIniciaisConfig {
    @Bean
    CommandLineRunner dadosIniciais(UsuarioRepository usuarios, CategoriaRepository categorias,
        PasswordEncoder encoder, @Value("${app.bootstrap.admin-email}") String email,
        @Value("${app.bootstrap.admin-password}") String senha) {
        return args -> {
            String emailNormalizado = Usuario.normalizarEmail(email);
            if (emailNormalizado != null && !emailNormalizado.isBlank() && senha != null && !senha.isBlank()
                    && usuarios.findByEmailIgnoreCase(emailNormalizado).isEmpty()) {
                usuarios.save(new Usuario("Administrador", emailNormalizado, encoder.encode(senha), PerfilUsuario.ADMINISTRADOR));
            }
            if (categorias.count() == 0) {
                categorias.save(new Categoria("Combustível", DESPESA));
                categorias.save(new Categoria("Pedágio", DESPESA));
                categorias.save(new Categoria("Manutenção", DESPESA));
                categorias.save(new Categoria("Serviços de guincho", RECEITA));
            }
        };
    }
}
