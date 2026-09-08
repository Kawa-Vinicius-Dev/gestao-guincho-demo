package com.anaiv.fluxogestao.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestTimingFilter extends OncePerRequestFilter {
    private static final Logger log = LoggerFactory.getLogger(RequestTimingFilter.class);

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String caminhoApi = request.getContextPath() + "/api";
        String uri = request.getRequestURI();
        return !uri.equals(caminhoApi) && !uri.startsWith(caminhoApi + "/");
    }

    @Override
    protected void doFilterInternal(
        HttpServletRequest request,
        HttpServletResponse response,
        FilterChain filterChain
    ) throws ServletException, IOException {
        long inicio = System.nanoTime();
        String requestId = UUID.randomUUID().toString();
        try {
            filterChain.doFilter(request, response);
        } finally {
            long duracaoMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - inicio);
            response.setHeader("X-Request-Id", requestId);
            response.setHeader("Server-Timing", "app;dur=" + duracaoMs);
            log.info(
                "requestId={} method={} path={} status={} durationMs={}",
                requestId,
                request.getMethod(),
                request.getRequestURI(),
                response.getStatus(),
                duracaoMs
            );
        }
    }
}
