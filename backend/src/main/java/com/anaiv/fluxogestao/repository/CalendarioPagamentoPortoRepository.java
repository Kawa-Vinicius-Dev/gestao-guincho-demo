package com.anaiv.fluxogestao.repository;

import com.anaiv.fluxogestao.entity.CalendarioPagamentoPorto;
import org.springframework.data.jpa.repository.JpaRepository;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface CalendarioPagamentoPortoRepository extends JpaRepository<CalendarioPagamentoPorto,Long> {
    Optional<CalendarioPagamentoPorto> findByDataPagamento(LocalDate dataPagamento);
    Optional<CalendarioPagamentoPorto> findFirstByAtivoTrueAndDataPagamentoAfterOrderByDataPagamento(LocalDate dataPagamento);
    List<CalendarioPagamentoPorto> findByAtivoTrueAndDataPagamentoAfterAndDataPagamentoLessThanEqualOrderByDataPagamento(LocalDate inicio,LocalDate fim);
    List<CalendarioPagamentoPorto> findAllByOrderByDataPagamento();
}
