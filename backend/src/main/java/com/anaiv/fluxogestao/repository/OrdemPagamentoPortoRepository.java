package com.anaiv.fluxogestao.repository;
import com.anaiv.fluxogestao.entity.OrdemPagamentoPorto; import org.springframework.data.jpa.repository.JpaRepository; import java.util.Optional;
public interface OrdemPagamentoPortoRepository extends JpaRepository<OrdemPagamentoPorto,Long>{Optional<OrdemPagamentoPorto> findByNumero(String numero);}
