package com.anaiv.fluxogestao.repository;
import com.anaiv.fluxogestao.entity.Categoria;
import com.anaiv.fluxogestao.entity.EnumsFinanceiros.TipoCategoria;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
public interface CategoriaRepository extends JpaRepository<Categoria, Long> {
    List<Categoria> findByTipoOrderByNome(TipoCategoria tipo);
}
