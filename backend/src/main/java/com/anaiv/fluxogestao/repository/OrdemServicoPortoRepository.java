package com.anaiv.fluxogestao.repository;
import com.anaiv.fluxogestao.entity.OrdemServicoPorto; import org.springframework.data.jpa.repository.JpaRepository; import java.util.Optional;
public interface OrdemServicoPortoRepository extends JpaRepository<OrdemServicoPorto,Long>{Optional<OrdemServicoPorto> findByNumero(String numero);}
