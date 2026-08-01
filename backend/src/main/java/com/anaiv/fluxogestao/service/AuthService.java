package com.anaiv.fluxogestao.service;

import com.anaiv.fluxogestao.dto.AuthDtos.*;
import com.anaiv.fluxogestao.entity.Sessao;
import com.anaiv.fluxogestao.entity.Usuario;
import com.anaiv.fluxogestao.repository.SessaoRepository;
import com.anaiv.fluxogestao.repository.UsuarioRepository;
import com.anaiv.fluxogestao.security.TokenSeguro;
import com.anaiv.fluxogestao.security.UsuarioPrincipal;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.OffsetDateTime;

@Service
public class AuthService {
    private final UsuarioRepository usuarios;
    private final SessaoRepository sessoes;
    private final PasswordEncoder encoder;
    private final long horasSessao;
    public AuthService(UsuarioRepository usuarios, SessaoRepository sessoes, PasswordEncoder encoder,
                       @Value("${app.session-hours:12}") long horasSessao) {
        this.usuarios = usuarios; this.sessoes = sessoes; this.encoder = encoder; this.horasSessao = horasSessao;
    }
    @Transactional
    public LoginResponse login(LoginRequest request) {
        Usuario usuario = usuarios.findByEmailIgnoreCase(Usuario.normalizarEmail(request.email()))
                .filter(Usuario::isAtivo)
                .filter(u -> encoder.matches(request.senha(), u.getSenhaHash()))
                .orElseThrow(() -> new IllegalArgumentException("E-mail ou senha inválidos."));
        String token = TokenSeguro.gerar();
        sessoes.save(new Sessao(usuario, TokenSeguro.hash(token), OffsetDateTime.now().plusHours(horasSessao)));
        return new LoginResponse(token, resposta(usuario));
    }
    @Transactional
    public void logout(String authorization) {
        if (authorization != null && authorization.startsWith("Bearer ")) {
            sessoes.deleteByTokenHash(TokenSeguro.hash(authorization.substring(7)));
        }
    }
    @Transactional
    public void trocarSenha(UsuarioPrincipal principal, TrocarSenhaRequest request) {
        Usuario usuario = usuarios.findById(principal.id()).orElseThrow();
        if (!encoder.matches(request.senhaAtual(), usuario.getSenhaHash())) {
            throw new IllegalArgumentException("A senha atual não confere.");
        }
        usuario.trocarSenha(encoder.encode(request.novaSenha()));
    }
    public UsuarioResponse me(UsuarioPrincipal principal) {
        return new UsuarioResponse(principal.id(), principal.nome(), principal.email(), principal.perfil());
    }
    private UsuarioResponse resposta(Usuario u) { return new UsuarioResponse(u.getId(), u.getNome(), u.getEmail(), u.getPerfil()); }
}
