package com.anaiv.fluxogestao.porto;
import org.springframework.data.jpa.repository.JpaRepository; import java.util.Optional;
public interface PendenciaFinanceiraPortoRepository extends JpaRepository<PendenciaFinanceiraPorto,Long>{Optional<PendenciaFinanceiraPorto> findByOrdemServico(OrdemServicoPorto os);}
