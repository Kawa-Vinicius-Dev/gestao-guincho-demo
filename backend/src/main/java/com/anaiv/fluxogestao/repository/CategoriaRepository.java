package com.anaiv.fluxogestao.repository;
import com.anaiv.fluxogestao.entity.Categoria;
import com.anaiv.fluxogestao.entity.EnumsFinanceiros.TipoCategoria;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;
public interface CategoriaRepository extends JpaRepository<Categoria, Long> {
    List<Categoria> findByTipoOrderByNome(TipoCategoria tipo);
    Optional<Categoria> findFirstByNomeIgnoreCaseAndTipo(String nome,TipoCategoria tipo);
}
