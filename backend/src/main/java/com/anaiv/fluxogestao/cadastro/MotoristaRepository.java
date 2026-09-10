package com.anaiv.fluxogestao.cadastro;
import com.anaiv.fluxogestao.cadastro.Motorista;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;
import java.util.*;
import com.anaiv.fluxogestao.auth.Usuario;
public interface MotoristaRepository extends JpaRepository<Motorista, Long> {
    Optional<Motorista> findFirstByNomeIgnoreCase(String nome);
    Optional<Motorista> findByQraIgnoreCase(String qra);
    Optional<Motorista> findByUsuario(Usuario usuario);
    /** Usuario e veiculo sao EAGER: sem o fetch, listar a equipe consulta um por socorrista. */
    @Query("select distinct m from Motorista m left join fetch m.usuario left join fetch m.veiculo")
    List<Motorista> findAllParaListagem();
    @Query("select m.qra from Motorista m where m.ativo=true and m.qra is not null")
    List<String> qrasAtivos();
    @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select m from Motorista m where m.id=:id")
    Optional<Motorista> findByIdForUpdate(@Param("id") Long id);
}
