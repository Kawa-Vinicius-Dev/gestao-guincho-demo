package com.anaiv.fluxogestao.controller;

import com.anaiv.fluxogestao.dto.AuthDtos.*;
import com.anaiv.fluxogestao.security.UsuarioPrincipal;
import com.anaiv.fluxogestao.service.AuthService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final AuthService service;
    public AuthController(AuthService service) { this.service = service; }
    @PostMapping("/login") public LoginResponse login(@Valid @RequestBody LoginRequest request) { return service.login(request); }
    @GetMapping("/me") public UsuarioResponse me(@AuthenticationPrincipal UsuarioPrincipal principal) { return service.me(principal); }
    @PostMapping("/logout") public ResponseEntity<Void> logout(@RequestHeader(value="Authorization", required=false) String auth) {
        service.logout(auth); return ResponseEntity.noContent().build();
    }
    @PutMapping("/senha") public ResponseEntity<Void> senha(@AuthenticationPrincipal UsuarioPrincipal principal,
        @Valid @RequestBody TrocarSenhaRequest request) {
        service.trocarSenha(principal, request); return ResponseEntity.noContent().build();
    }
}
