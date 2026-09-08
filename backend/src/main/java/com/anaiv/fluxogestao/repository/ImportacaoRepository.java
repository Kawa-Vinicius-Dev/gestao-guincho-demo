package com.anaiv.fluxogestao.repository;
import com.anaiv.fluxogestao.entity.Importacao;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.Optional;
public interface ImportacaoRepository extends JpaRepository<Importacao, Long> {
    boolean existsByHashArquivo(String hashArquivo);
    Optional<Importacao> findByHashArquivo(String hashArquivo);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select i from Importacao i where i.id=:id")
    Optional<Importacao> findByIdForUpdate(@Param("id") Long id);
    @Query("select coalesce(sum(i.totalRegistros),0) from Importacao i where i.status=:status")
    long somarTotalRegistrosPorStatus(@Param("status") com.anaiv.fluxogestao.entity.EnumsFinanceiros.StatusImportacao status);
}
