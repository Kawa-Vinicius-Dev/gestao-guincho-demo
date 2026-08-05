package com.anaiv.fluxogestao.repository;
import com.anaiv.fluxogestao.entity.Receita;
import org.springframework.data.jpa.repository.JpaRepository;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import com.anaiv.fluxogestao.entity.OrdemServicoPorto;
public interface ReceitaRepository extends JpaRepository<Receita, Long> {
    List<Receita> findByDataCompetenciaBetweenOrderByDataCompetenciaDesc(LocalDate inicio, LocalDate fim);
    Optional<Receita> findByOrdemServicoPorto(OrdemServicoPorto ordemServicoPorto);
}
