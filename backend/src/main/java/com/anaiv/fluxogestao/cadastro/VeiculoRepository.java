package com.anaiv.fluxogestao.cadastro;
import com.anaiv.fluxogestao.cadastro.Veiculo;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
public interface VeiculoRepository extends JpaRepository<Veiculo, Long> {
    Optional<Veiculo> findFirstByIdentificacaoIgnoreCase(String identificacao);
    Optional<Veiculo> findFirstByPlacaIgnoreCase(String placa);
}
