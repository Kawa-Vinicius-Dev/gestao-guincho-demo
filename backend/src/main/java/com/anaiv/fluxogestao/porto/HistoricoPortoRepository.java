package com.anaiv.fluxogestao.porto;

import com.anaiv.fluxogestao.porto.*;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface HistoricoPortoRepository extends JpaRepository<HistoricoPorto,Long> {
    List<HistoricoPorto> findByOrdemPagamentoOrderByCriadoEmDesc(OrdemPagamentoPorto op);
    
}
