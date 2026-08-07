package com.anaiv.fluxogestao.repository;
import com.anaiv.fluxogestao.entity.Motorista;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
import com.anaiv.fluxogestao.entity.Usuario;
public interface MotoristaRepository extends JpaRepository<Motorista, Long> {
    Optional<Motorista> findFirstByNomeIgnoreCase(String nome);
    List<Motorista> findByNomeIgnoreCase(String nome);
    Optional<Motorista> findByQraIgnoreCase(String qra);
    Optional<Motorista> findByUsuario(Usuario usuario);
}
