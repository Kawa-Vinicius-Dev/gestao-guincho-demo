package com.anaiv.fluxogestao.repository;
import com.anaiv.fluxogestao.entity.*; import org.springframework.data.jpa.repository.JpaRepository; import java.util.*;
public interface OrdemServicoPortoRepository extends JpaRepository<OrdemServicoPorto,Long>{Optional<OrdemServicoPorto> findByNumero(String numero);List<OrdemServicoPorto> findByOrdemPagamento(OrdemPagamentoPorto op);List<OrdemServicoPorto> findByImportacao(Importacao importacao);List<OrdemServicoPorto> findByMotorista(Motorista motorista);}
