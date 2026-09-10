package com.anaiv.fluxogestao.cadastro;
import com.anaiv.fluxogestao.financeiro.*;
import com.anaiv.fluxogestao.cadastro.Categoria;
import com.anaiv.fluxogestao.financeiro.EnumsFinanceiros.TipoCategoria;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;
public interface CategoriaRepository extends JpaRepository<Categoria, Long> {
    List<Categoria> findByTipoOrderByNome(TipoCategoria tipo);
    Optional<Categoria> findFirstByNomeIgnoreCaseAndTipo(String nome,TipoCategoria tipo);
}
