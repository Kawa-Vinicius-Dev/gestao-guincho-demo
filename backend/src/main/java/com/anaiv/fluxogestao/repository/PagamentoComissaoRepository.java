package com.anaiv.fluxogestao.repository;

import com.anaiv.fluxogestao.entity.*;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface PagamentoComissaoRepository extends JpaRepository<PagamentoComissao,Long> {
    Optional<PagamentoComissao> findByMotoristaAndCalendarioPagamento(Motorista motorista,CalendarioPagamentoPorto calendarioPagamento);
}
