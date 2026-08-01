package com.anaiv.fluxogestao.dto;

import com.anaiv.fluxogestao.entity.EnumsFinanceiros.TipoCategoria;
import com.anaiv.fluxogestao.entity.PerfilUsuario;
import com.anaiv.fluxogestao.entity.Usuario;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;

public final class CadastroDtos {
    private CadastroDtos() {}
    public record VeiculoRequest(@NotBlank String identificacao, @NotBlank @Pattern(regexp="[A-Za-z]{3}[0-9][A-Za-z0-9][0-9]{2}") String placa,
                                 String modelo, @NotNull @DecimalMin("0") BigDecimal custoPorKm) {}
    public record VeiculoResponse(Long id, String identificacao, String placa, String modelo, BigDecimal custoPorKm, boolean ativo) {}
    public record ContratanteRequest(@NotBlank String nome, String documento) {}
    public record ContratanteResponse(Long id, String nome, String documento, boolean ativo) {}
    public record CategoriaRequest(@NotBlank String nome, @NotNull TipoCategoria tipo) {}
    public record CategoriaResponse(Long id, String nome, TipoCategoria tipo, boolean ativo) {}
    public record MotoristaRequest(@NotBlank String nome, String telefone, String documento, Long usuarioId) {}
    public record MotoristaResponse(Long id, String nome, String telefone, String documento, Long usuarioId, boolean ativo) {}
    public record UsuarioRequest(@NotBlank String nome, @Email @NotBlank String email, @NotBlank @Size(min=8) String senha, @NotNull PerfilUsuario perfil) {
        public UsuarioRequest { email = Usuario.normalizarEmail(email); }
    }
    public record UsuarioResponse(Long id, String nome, String email, PerfilUsuario perfil, boolean ativo) {}
}
