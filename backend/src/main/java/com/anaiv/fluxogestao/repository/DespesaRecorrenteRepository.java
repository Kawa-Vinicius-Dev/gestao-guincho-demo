package com.anaiv.fluxogestao.repository;
import com.anaiv.fluxogestao.entity.DespesaRecorrente;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import java.util.List;
public interface DespesaRecorrenteRepository extends JpaRepository<DespesaRecorrente,Long> {
    @Query("select distinct d from DespesaRecorrente d left join fetch d.categoria left join fetch d.veiculo left join fetch d.motorista order by d.descricao")
    List<DespesaRecorrente> findAllParaListagem();
}
