package com.anaiv.fluxogestao.auth;

import com.anaiv.fluxogestao.auth.AuthDtos.*;
import com.anaiv.fluxogestao.exception.MuitasTentativasException;
import com.anaiv.fluxogestao.security.LimitadorDeLogin;
import com.anaiv.fluxogestao.security.UsuarioPrincipal;
import com.anaiv.fluxogestao.auth.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final AuthService service;
    private final LimitadorDeLogin limitador;
    public AuthController(AuthService service, LimitadorDeLogin limitador) {
        this.service = service; this.limitador = limitador;
    }
    @PostMapping("/login") public LoginResponse login(@Valid @RequestBody LoginRequest request, HttpServletRequest http) {
        String ip = enderecoCliente(http);
        if (limitador.bloqueado(ip)) {
            throw new MuitasTentativasException("Muitas tentativas de login. Aguarde alguns minutos e tente novamente.");
        }
        try {
            LoginResponse resposta = service.login(request);
            limitador.registrarSucesso(ip);
            return resposta;
        } catch (IllegalArgumentException e) {
            limitador.registrarFalha(ip);
            throw e;
        }
    }
    private String enderecoCliente(HttpServletRequest request) {
        String encaminhado = request.getHeader("X-Forwarded-For");
        if (encaminhado != null && !encaminhado.isBlank()) return encaminhado.split(",")[0].trim();
        return request.getRemoteAddr();
    }
    @GetMapping("/me") public UsuarioResponse me(@AuthenticationPrincipal UsuarioPrincipal principal) { return service.me(principal); }
    @PostMapping("/logout") public ResponseEntity<Void> logout(@RequestHeader(value="Authorization", required=false) String auth) {
        service.logout(auth); return ResponseEntity.noContent().build();
    }
    @PutMapping("/senha") public ResponseEntity<Void> senha(@AuthenticationPrincipal UsuarioPrincipal principal,
        @Valid @RequestBody TrocarSenhaRequest request) {
        service.trocarSenha(principal, request); return ResponseEntity.noContent().build();
    }
}
