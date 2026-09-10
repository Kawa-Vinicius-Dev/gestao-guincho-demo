package com.anaiv.fluxogestao.financeiro;
import com.anaiv.fluxogestao.financeiro.ContaReceber;
import org.springframework.data.jpa.repository.JpaRepository;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import com.anaiv.fluxogestao.porto.OrdemServicoPorto;
public interface ContaReceberRepository extends JpaRepository<ContaReceber, Long> {
    List<ContaReceber> findByDataCompetenciaBetweenOrderByVencimento(LocalDate inicio, LocalDate fim);
    Optional<ContaReceber> findByOrdemServicoPorto(OrdemServicoPorto ordemServicoPorto);
    List<ContaReceber> findByOrdemServicoPortoIn(Collection<OrdemServicoPorto> ordensServicoPorto);
}
