package com.anaiv.fluxogestao.favoritos;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface FavoritoMenuRepository extends JpaRepository<FavoritoMenu, Long> {
    List<FavoritoMenu> findByUsuarioIdOrderByOrdemAscIdAsc(Long usuarioId);
    void deleteByUsuarioId(Long usuarioId);
}
