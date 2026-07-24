package com.anaiv.fluxogestao.repository;
import com.anaiv.fluxogestao.entity.Quilometragem;
import org.springframework.data.jpa.repository.JpaRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
public interface QuilometragemRepository extends JpaRepository<Quilometragem, Long> {
    boolean existsByDataAndVeiculoIdAndHodometroInicialAndHodometroFinal(LocalDate data, Long veiculoId, BigDecimal inicio, BigDecimal fim);
    List<Quilometragem> findByDataBetweenOrderByDataDesc(LocalDate inicio, LocalDate fim);
}
