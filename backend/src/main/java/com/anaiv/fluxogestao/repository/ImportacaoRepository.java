package com.anaiv.fluxogestao.repository;
import com.anaiv.fluxogestao.entity.Importacao;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
public interface ImportacaoRepository extends JpaRepository<Importacao, Long> {
    boolean existsByHashArquivo(String hashArquivo);
    Optional<Importacao> findByHashArquivo(String hashArquivo);
}
