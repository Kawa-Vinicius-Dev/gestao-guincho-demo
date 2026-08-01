package com.anaiv.fluxogestao.service;

import com.anaiv.fluxogestao.dto.CadastroDtos.*;
import com.anaiv.fluxogestao.entity.*;
import com.anaiv.fluxogestao.entity.EnumsFinanceiros.TipoCategoria;
import com.anaiv.fluxogestao.exception.RecursoNaoEncontradoException;
import com.anaiv.fluxogestao.repository.*;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;

@Service
public class CadastroService {
    private final VeiculoRepository veiculos; private final ContratanteRepository contratantes;
    private final CategoriaRepository categorias; private final MotoristaRepository motoristas;
    private final UsuarioRepository usuarios; private final PasswordEncoder encoder;
    public CadastroService(VeiculoRepository v, ContratanteRepository c, CategoriaRepository ca,
                           MotoristaRepository m, UsuarioRepository u, PasswordEncoder encoder) {
        veiculos=v; contratantes=c; categorias=ca; motoristas=m; usuarios=u; this.encoder=encoder;
    }
    @Transactional public VeiculoResponse criar(VeiculoRequest r) {
        return veiculo(new Veiculo(r.identificacao(), r.placa(), r.modelo(), r.custoPorKm()), true);
    }
    public List<VeiculoResponse> veiculos() { return veiculos.findAll().stream().map(this::veiculo).toList(); }
    @Transactional public ContratanteResponse criar(ContratanteRequest r) {
        return contratante(contratantes.save(new Contratante(r.nome(), r.documento())));
    }
    public List<ContratanteResponse> contratantes() { return contratantes.findAll().stream().map(this::contratante).toList(); }
    @Transactional public CategoriaResponse criar(CategoriaRequest r) {
        return categoria(categorias.save(new Categoria(r.nome(), r.tipo())));
    }
    public List<CategoriaResponse> categorias(TipoCategoria tipo) {
        var lista = tipo == null ? categorias.findAll() : categorias.findByTipoOrderByNome(tipo);
        return lista.stream().map(this::categoria).toList();
    }
    @Transactional public MotoristaResponse criar(MotoristaRequest r) {
        Usuario usuario = r.usuarioId() == null ? null : usuario(r.usuarioId());
        return motorista(motoristas.save(new Motorista(r.nome(), r.telefone(), r.documento(), usuario)));
    }
    public List<MotoristaResponse> motoristas() { return motoristas.findAll().stream().map(this::motorista).toList(); }
    @Transactional public UsuarioResponse criar(UsuarioRequest r) {
        String email = Usuario.normalizarEmail(r.email());
        if (usuarios.findByEmailIgnoreCase(email).isPresent()) throw new IllegalArgumentException("Já existe um usuário com este e-mail.");
        return usuario(usuarios.save(new Usuario(r.nome(), email, encoder.encode(r.senha()), r.perfil())));
    }
    public List<UsuarioResponse> usuarios() { return usuarios.findAll().stream().map(this::usuario).toList(); }

    public Veiculo obterVeiculo(Long id) { return id == null ? null : veiculos.findById(id).orElseThrow(() -> naoEncontrado("Veículo", id)); }
    public Contratante obterContratante(Long id) { return contratantes.findById(id).orElseThrow(() -> naoEncontrado("Contratante", id)); }
    public Categoria obterCategoria(Long id) { return id == null ? null : categorias.findById(id).orElseThrow(() -> naoEncontrado("Categoria", id)); }
    public Motorista obterMotorista(Long id) { return id == null ? null : motoristas.findById(id).orElseThrow(() -> naoEncontrado("Motorista", id)); }
    public Usuario usuario(Long id) { return usuarios.findById(id).orElseThrow(() -> naoEncontrado("Usuário", id)); }
    private RecursoNaoEncontradoException naoEncontrado(String tipo, Long id) { return new RecursoNaoEncontradoException(tipo + " " + id + " não encontrado."); }

    private VeiculoResponse veiculo(Veiculo v, boolean salvar) { return veiculo(salvar ? veiculos.save(v) : v); }
    public VeiculoResponse veiculo(Veiculo v) { return new VeiculoResponse(v.getId(),v.getIdentificacao(),v.getPlaca(),v.getModelo(),v.getCustoPorKm(),v.isAtivo()); }
    public ContratanteResponse contratante(Contratante c) { return new ContratanteResponse(c.getId(),c.getNome(),c.getDocumento(),c.isAtivo()); }
    private CategoriaResponse categoria(Categoria c) { return new CategoriaResponse(c.getId(),c.getNome(),c.getTipo(),c.isAtivo()); }
    private MotoristaResponse motorista(Motorista m) { return new MotoristaResponse(m.getId(),m.getNome(),m.getTelefone(),m.getDocumento(),m.getUsuario()==null?null:m.getUsuario().getId(),m.isAtivo()); }
    private UsuarioResponse usuario(Usuario u) { return new UsuarioResponse(u.getId(),u.getNome(),u.getEmail(),u.getPerfil(),u.isAtivo()); }
}
