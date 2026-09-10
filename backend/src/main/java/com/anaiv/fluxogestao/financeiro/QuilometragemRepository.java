package com.anaiv.fluxogestao.financeiro;
import com.anaiv.fluxogestao.financeiro.Quilometragem;
import org.springframework.data.jpa.repository.JpaRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
public interface QuilometragemRepository extends JpaRepository<Quilometragem, Long> {
    boolean existsByDataAndVeiculoIdAndHodometroInicialAndHodometroFinal(LocalDate data, Long veiculoId, BigDecimal inicio, BigDecimal fim);
    List<Quilometragem> findByDataBetweenOrderByDataDesc(LocalDate inicio, LocalDate fim);
    List<Quilometragem> findByDataBetween(LocalDate inicio,LocalDate fim);
}
