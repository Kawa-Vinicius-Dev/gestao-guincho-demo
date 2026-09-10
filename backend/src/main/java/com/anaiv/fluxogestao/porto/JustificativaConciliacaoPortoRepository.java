package com.anaiv.fluxogestao.porto;

import com.anaiv.fluxogestao.porto.JustificativaConciliacaoPorto;
import com.anaiv.fluxogestao.porto.OrdemPagamentoPorto;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface JustificativaConciliacaoPortoRepository extends JpaRepository<JustificativaConciliacaoPorto,Long> {
    List<JustificativaConciliacaoPorto> findByOrdemPagamentoOrderByCriadoEmDesc(OrdemPagamentoPorto ordemPagamento);
}
