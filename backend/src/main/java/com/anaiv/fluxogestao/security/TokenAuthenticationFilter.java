package com.anaiv.fluxogestao.security;

import com.anaiv.fluxogestao.auth.SessaoRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;
import java.time.OffsetDateTime;
import java.util.List;

@Component
public class TokenAuthenticationFilter extends OncePerRequestFilter {
    private final SessaoRepository sessoes;
    public TokenAuthenticationFilter(SessaoRepository sessoes) { this.sessoes = sessoes; }

    /**
     * A senha provisoria viaja por WhatsApp, entao ela vale so para uma coisa: entrar e trocar.
     * Enquanto nao trocar, o token abre apenas o proprio perfil, a troca e a saida. Sem isso a
     * obrigatoriedade seria so da tela, e a API continuaria aberta para quem interceptasse a senha.
     */
    private boolean bloqueadoPorSenhaProvisoria(HttpServletRequest request) {
        var autenticacao = SecurityContextHolder.getContext().getAuthentication();
        if (autenticacao == null || !(autenticacao.getPrincipal() instanceof UsuarioPrincipal principal)) return false;
        if (!principal.senhaProvisoria()) return false;
        String caminho = request.getRequestURI();
        return !(caminho.equals("/api/auth/me") || caminho.equals("/api/auth/senha") || caminho.equals("/api/auth/logout"));
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            String hash = TokenSeguro.hash(header.substring(7));
            sessoes.findByTokenHash(hash).filter(s -> s.getExpiraEm().isAfter(OffsetDateTime.now()))
                    .filter(s -> s.getUsuario().isAtivo()).ifPresent(s -> {
                        var u = s.getUsuario();
                        var principal = new UsuarioPrincipal(u.getId(), u.getNome(), u.getEmail(), u.getPerfil(), u.isSenhaProvisoria());
                        var auth = new UsernamePasswordAuthenticationToken(principal, null,
                                List.of(new SimpleGrantedAuthority("ROLE_" + u.getPerfil().name())));
                        SecurityContextHolder.getContext().setAuthentication(auth);
                    });
        }
        if (bloqueadoPorSenhaProvisoria(request)) {
            response.setStatus(403);
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"status\":403,\"titulo\":\"Senha provisória\",\"detalhe\":\"Troque a senha provisória antes de usar o sistema.\"}");
            return;
        }
        chain.doFilter(request, response);
    }
}
