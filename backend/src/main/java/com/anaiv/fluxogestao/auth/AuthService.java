package com.anaiv.fluxogestao.auth;

import com.anaiv.fluxogestao.auth.AuthDtos.*;
import com.anaiv.fluxogestao.auth.Sessao;
import com.anaiv.fluxogestao.auth.Usuario;
import com.anaiv.fluxogestao.auth.SessaoRepository;
import com.anaiv.fluxogestao.auth.UsuarioRepository;
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
    private final int forcaBcrypt;
    public AuthService(UsuarioRepository usuarios, SessaoRepository sessoes, PasswordEncoder encoder,
                       @Value("${app.session-hours:12}") long horasSessao,
                       @Value("${app.security.bcrypt-strength:10}") int forcaBcrypt) {
        this.usuarios = usuarios; this.sessoes = sessoes; this.encoder = encoder; this.horasSessao = horasSessao;
        this.forcaBcrypt = forcaBcrypt;
    }
    @Transactional
    public LoginResponse login(LoginRequest request) {
        Usuario usuario = usuarios.findByEmailIgnoreCase(Usuario.normalizarEmail(request.email()))
                .filter(Usuario::isAtivo)
                .filter(u -> encoder.matches(request.senha(), u.getSenhaHash()))
                .orElseThrow(() -> new IllegalArgumentException("E-mail ou senha inválidos."));
        regravarHashSeDesatualizado(usuario, request.senha());
        sessoes.deleteByUsuarioAndExpiraEmBefore(usuario, OffsetDateTime.now());
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
        // trocar a senha e o que se faz quando um acesso vaza: os tokens ja emitidos precisam morrer junto.
        sessoes.deleteByUsuario(usuario);
    }
    public UsuarioResponse me(UsuarioPrincipal principal) {
        return new UsuarioResponse(principal.id(), principal.nome(), principal.email(), principal.perfil(), principal.senhaProvisoria());
    }
    /**
     * O custo do BCrypt fica gravado dentro do proprio hash, entao baixar o fator de trabalho na
     * configuracao nao acelera quem ja tem senha cadastrada. Regrava o hash no primeiro login apos
     * a mudanca: o usuario paga o custo antigo uma vez e passa a usar o novo fator dai em diante.
     */
    private void regravarHashSeDesatualizado(Usuario usuario, String senha) {
        if (custoDoHash(usuario.getSenhaHash()) != forcaBcrypt) usuario.trocarSenha(encoder.encode(senha));
    }
    private int custoDoHash(String hash) {
        if (hash == null || hash.length() < 7 || !hash.startsWith("$2")) return forcaBcrypt;
        try { return Integer.parseInt(hash.substring(4, 6)); } catch (NumberFormatException e) { return forcaBcrypt; }
    }
    private UsuarioResponse resposta(Usuario u) { return new UsuarioResponse(u.getId(), u.getNome(), u.getEmail(), u.getPerfil(), u.isSenhaProvisoria()); }
}
