package com.anaiv.fluxogestao.repository;
import com.anaiv.fluxogestao.entity.Receita;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import com.anaiv.fluxogestao.entity.OrdemServicoPorto;
public interface ReceitaRepository extends JpaRepository<Receita, Long> {
    @Query("select r from Receita r where coalesce(r.dataRecebimento,r.dataCompetencia) between :inicio and :fim")
    List<Receita> findParaDashboardEntre(@Param("inicio") LocalDate inicio,@Param("fim") LocalDate fim);
    Optional<Receita> findByOrdemServicoPorto(OrdemServicoPorto ordemServicoPorto);
    List<Receita> findByOrdemServicoPortoIn(Collection<OrdemServicoPorto> ordensServicoPorto);
}
