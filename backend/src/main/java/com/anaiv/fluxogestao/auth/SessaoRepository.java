package com.anaiv.fluxogestao.auth;
import com.anaiv.fluxogestao.auth.Sessao;
import com.anaiv.fluxogestao.auth.Usuario;
import org.springframework.data.jpa.repository.JpaRepository;
import java.time.OffsetDateTime;
import java.util.Optional;
public interface SessaoRepository extends JpaRepository<Sessao, Long> {
    Optional<Sessao> findByTokenHash(String tokenHash);
    void deleteByTokenHash(String tokenHash);
    void deleteByUsuario(Usuario usuario);
    void deleteByUsuarioAndExpiraEmBefore(Usuario usuario, OffsetDateTime limite);
}
