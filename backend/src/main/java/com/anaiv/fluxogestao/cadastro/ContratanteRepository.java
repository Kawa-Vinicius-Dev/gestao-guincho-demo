package com.anaiv.fluxogestao.cadastro;
import com.anaiv.fluxogestao.cadastro.Contratante;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
public interface ContratanteRepository extends JpaRepository<Contratante, Long> { Optional<Contratante> findFirstByNomeIgnoreCase(String nome); }
