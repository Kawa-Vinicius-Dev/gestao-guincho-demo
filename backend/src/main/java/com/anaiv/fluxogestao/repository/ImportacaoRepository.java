package com.anaiv.fluxogestao.repository;
import com.anaiv.fluxogestao.entity.Importacao;
import org.springframework.data.jpa.repository.JpaRepository;
public interface ImportacaoRepository extends JpaRepository<Importacao, Long> {
    boolean existsByHashArquivo(String hashArquivo);
}
