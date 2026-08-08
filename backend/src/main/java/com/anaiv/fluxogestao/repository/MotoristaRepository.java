package com.anaiv.fluxogestao.repository;
import com.anaiv.fluxogestao.entity.Motorista;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;
import java.util.*;
import com.anaiv.fluxogestao.entity.Usuario;
public interface MotoristaRepository extends JpaRepository<Motorista, Long> {
    Optional<Motorista> findFirstByNomeIgnoreCase(String nome);
    List<Motorista> findByNomeIgnoreCase(String nome);
    Optional<Motorista> findByQraIgnoreCase(String qra);
    Optional<Motorista> findByUsuario(Usuario usuario);
    @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select m from Motorista m where m.id=:id")
    Optional<Motorista> findByIdForUpdate(@Param("id") Long id);
}
