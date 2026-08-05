package com.anaiv.fluxogestao.repository;
import com.anaiv.fluxogestao.entity.Veiculo;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
public interface VeiculoRepository extends JpaRepository<Veiculo, Long> {
    Optional<Veiculo> findFirstByIdentificacaoIgnoreCase(String identificacao);
    Optional<Veiculo> findFirstByPlacaIgnoreCase(String placa);
}
