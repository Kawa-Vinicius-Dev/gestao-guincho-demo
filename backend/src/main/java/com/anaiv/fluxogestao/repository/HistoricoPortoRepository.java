package com.anaiv.fluxogestao.repository;

import com.anaiv.fluxogestao.entity.*;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface HistoricoPortoRepository extends JpaRepository<HistoricoPorto,Long> {
    List<HistoricoPorto> findByOrdemPagamentoOrderByCriadoEmDesc(OrdemPagamentoPorto op);
    List<HistoricoPorto> findByOrdemServicoOrderByCriadoEmDesc(OrdemServicoPorto os);
}
