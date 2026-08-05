package com.anaiv.fluxogestao.repository;
import com.anaiv.fluxogestao.entity.Motorista;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
public interface MotoristaRepository extends JpaRepository<Motorista, Long> { Optional<Motorista> findFirstByNomeIgnoreCase(String nome); }
