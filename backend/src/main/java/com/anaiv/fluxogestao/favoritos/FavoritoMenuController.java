package com.anaiv.fluxogestao.favoritos;

import com.anaiv.fluxogestao.security.UsuarioPrincipal;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Atalhos do menu, por pessoa.
 *
 * Duas operacoes: ler a lista e substituir a lista. Nao ha "adicionar" nem
 * "remover" separados de proposito - a tela sempre sabe a lista inteira, e uma
 * troca atomica dispensa a conversa sobre o que fazer quando dois cliques
 * rapidos chegam fora de ordem.
 */
@RestController
@RequestMapping("/api/favoritos")
public class FavoritoMenuController {
    /** Teto para a lista nao virar deposito, e para o topo do menu continuar curto. */
    private static final int MAXIMO = 8;

    private final FavoritoMenuRepository repositorio;

    public FavoritoMenuController(FavoritoMenuRepository repositorio) {
        this.repositorio = repositorio;
    }

    public record FavoritosRequest(
        @NotNull @Size(max = MAXIMO, message = "São no máximo " + MAXIMO + " atalhos.")
        List<@Size(max = 120) String> rotas) {}

    public record FavoritosResponse(List<String> rotas) {}

    @GetMapping
    public FavoritosResponse listar(@AuthenticationPrincipal UsuarioPrincipal principal) {
        return new FavoritosResponse(rotasDe(principal.id()));
    }

    @PutMapping
    @Transactional
    public FavoritosResponse substituir(@AuthenticationPrincipal UsuarioPrincipal principal,
                                        @Valid @RequestBody FavoritosRequest pedido) {
        // Repetida na lista conta uma vez, e a ordem enviada e a ordem guardada:
        // e a ordem em que a pessoa arrumou os atalhos dela.
        List<String> rotas = pedido.rotas().stream()
            .filter(r -> r != null && !r.isBlank())
            .map(String::trim)
            .distinct()
            .limit(MAXIMO)
            .toList();

        repositorio.deleteByUsuarioId(principal.id());
        // flush antes de reinserir: a chave unica (usuario, rota) recusaria a
        // insercao de uma rota que continua na lista se o delete ficasse pendente.
        repositorio.flush();
        for (int i = 0; i < rotas.size(); i++) {
            repositorio.save(new FavoritoMenu(principal.id(), rotas.get(i), i));
        }
        return new FavoritosResponse(rotas);
    }

    private List<String> rotasDe(Long usuarioId) {
        return repositorio.findByUsuarioIdOrderByOrdemAscIdAsc(usuarioId).stream()
            .map(FavoritoMenu::getRota).toList();
    }
}
