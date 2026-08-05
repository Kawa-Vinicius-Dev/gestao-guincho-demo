package com.anaiv.fluxogestao.repository;
import com.anaiv.fluxogestao.entity.Contratante;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
public interface ContratanteRepository extends JpaRepository<Contratante, Long> { Optional<Contratante> findFirstByNomeIgnoreCase(String nome); }
