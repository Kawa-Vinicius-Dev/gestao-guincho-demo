package com.anaiv.fluxogestao.security;

import com.anaiv.fluxogestao.entity.PerfilUsuario;

public record UsuarioPrincipal(Long id, String nome, String email, PerfilUsuario perfil) {}
