package com.anaiv.fluxogestao.repository;
import com.anaiv.fluxogestao.entity.Sessao;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
public interface SessaoRepository extends JpaRepository<Sessao, Long> {
    Optional<Sessao> findByTokenHash(String tokenHash);
    void deleteByTokenHash(String tokenHash);
}
