package com.anaiv.fluxogestao.auth;

import com.anaiv.fluxogestao.auth.PerfilUsuario;
import com.anaiv.fluxogestao.auth.Usuario;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public final class AuthDtos {
    private AuthDtos() {}
    public record LoginRequest(@Email @NotBlank String email, @NotBlank String senha) {
        public LoginRequest { email = Usuario.normalizarEmail(email); }
    }
    public record UsuarioResponse(Long id, String nome, String email, PerfilUsuario perfil, boolean senhaProvisoria) {}
    public record LoginResponse(String token, UsuarioResponse usuario) {}
    public record TrocarSenhaRequest(@NotBlank String senhaAtual, @NotBlank @Size(min = 8) String novaSenha) {}
}
