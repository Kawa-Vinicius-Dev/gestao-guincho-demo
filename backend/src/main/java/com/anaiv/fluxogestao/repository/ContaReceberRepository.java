package com.anaiv.fluxogestao.repository;
import com.anaiv.fluxogestao.entity.ContaReceber;
import org.springframework.data.jpa.repository.JpaRepository;
import java.time.LocalDate;
import java.util.List;
public interface ContaReceberRepository extends JpaRepository<ContaReceber, Long> {
    List<ContaReceber> findByDataCompetenciaBetweenOrderByVencimento(LocalDate inicio, LocalDate fim);
}
