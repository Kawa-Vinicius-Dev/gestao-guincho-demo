package com.anaiv.fluxogestao.repository;
import com.anaiv.fluxogestao.entity.Despesa;
import org.springframework.data.jpa.repository.JpaRepository;
import java.time.LocalDate;
import java.util.List;
import com.anaiv.fluxogestao.entity.Motorista;
import com.anaiv.fluxogestao.entity.EnumsFinanceiros.NaturezaDespesa;
public interface DespesaRepository extends JpaRepository<Despesa, Long> {
    List<Despesa> findByDataBetweenOrderByDataDesc(LocalDate inicio, LocalDate fim);
    List<Despesa> findByMotoristaAndNaturezaAndDataBetweenOrderByDataDesc(Motorista motorista,NaturezaDespesa natureza,LocalDate inicio,LocalDate fim);
}
