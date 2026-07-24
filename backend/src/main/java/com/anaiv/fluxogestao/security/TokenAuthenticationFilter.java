package com.anaiv.fluxogestao.security;

import com.anaiv.fluxogestao.repository.SessaoRepository;
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

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            String hash = TokenSeguro.hash(header.substring(7));
            sessoes.findByTokenHash(hash).filter(s -> s.getExpiraEm().isAfter(OffsetDateTime.now()))
                    .filter(s -> s.getUsuario().isAtivo()).ifPresent(s -> {
                        var u = s.getUsuario();
                        var principal = new UsuarioPrincipal(u.getId(), u.getNome(), u.getEmail(), u.getPerfil());
                        var auth = new UsernamePasswordAuthenticationToken(principal, null,
                                List.of(new SimpleGrantedAuthority("ROLE_" + u.getPerfil().name())));
                        SecurityContextHolder.getContext().setAuthentication(auth);
                    });
        }
        chain.doFilter(request, response);
    }
}
