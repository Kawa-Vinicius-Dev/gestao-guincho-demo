package com.anaiv.fluxogestao.repository;

import com.anaiv.fluxogestao.entity.JustificativaConciliacaoPorto;
import com.anaiv.fluxogestao.entity.OrdemPagamentoPorto;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface JustificativaConciliacaoPortoRepository extends JpaRepository<JustificativaConciliacaoPorto,Long> {
    List<JustificativaConciliacaoPorto> findByOrdemPagamentoOrderByCriadoEmDesc(OrdemPagamentoPorto ordemPagamento);
}
