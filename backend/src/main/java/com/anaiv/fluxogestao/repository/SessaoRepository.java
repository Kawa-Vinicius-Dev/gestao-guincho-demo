package com.anaiv.fluxogestao.repository;
import com.anaiv.fluxogestao.entity.Sessao;
import com.anaiv.fluxogestao.entity.Usuario;
import org.springframework.data.jpa.repository.JpaRepository;
import java.time.OffsetDateTime;
import java.util.Optional;
public interface SessaoRepository extends JpaRepository<Sessao, Long> {
    Optional<Sessao> findByTokenHash(String tokenHash);
    void deleteByTokenHash(String tokenHash);
    void deleteByUsuario(Usuario usuario);
    void deleteByUsuarioAndExpiraEmBefore(Usuario usuario, OffsetDateTime limite);
}
