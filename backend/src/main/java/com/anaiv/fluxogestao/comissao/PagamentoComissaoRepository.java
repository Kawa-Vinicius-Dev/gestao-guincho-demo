package com.anaiv.fluxogestao.comissao;

import com.anaiv.fluxogestao.cadastro.*;
import com.anaiv.fluxogestao.comissao.*;
import com.anaiv.fluxogestao.porto.*;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface PagamentoComissaoRepository extends JpaRepository<PagamentoComissao,Long> {
    Optional<PagamentoComissao> findByMotoristaAndCalendarioPagamento(Motorista motorista,CalendarioPagamentoPorto calendarioPagamento);
    List<PagamentoComissao> findByCalendarioPagamento(CalendarioPagamentoPorto calendarioPagamento);
}
