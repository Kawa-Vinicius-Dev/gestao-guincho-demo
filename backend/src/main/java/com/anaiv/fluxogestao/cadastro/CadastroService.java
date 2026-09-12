package com.anaiv.fluxogestao.cadastro;

import com.anaiv.fluxogestao.auth.*;
import com.anaiv.fluxogestao.cadastro.*;
import com.anaiv.fluxogestao.financeiro.*;
import com.anaiv.fluxogestao.cadastro.CadastroDtos.*;
import com.anaiv.fluxogestao.financeiro.EnumsFinanceiros.TipoCategoria;
import com.anaiv.fluxogestao.exception.RecursoNaoEncontradoException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.security.SecureRandom;
import java.util.List;

@Service
public class CadastroService {
    private final VeiculoRepository veiculos; private final ContratanteRepository contratantes;
    private final CategoriaRepository categorias; private final MotoristaRepository motoristas;
    private final UsuarioRepository usuarios; private final PasswordEncoder encoder; private final SessaoRepository sessoes;
    private static final SecureRandom SORTEIO = new SecureRandom();
    // Sem 0/O e 1/l/I: a senha e ditada ou colada num WhatsApp e nao pode depender de fonte.
    private static final String ALFABETO = "abcdefghjkmnpqrstuvwxyz23456789";
    private final com.anaiv.fluxogestao.porto.PortoService porto;
    public CadastroService(VeiculoRepository v, ContratanteRepository c, CategoriaRepository ca,
                           MotoristaRepository m, UsuarioRepository u, PasswordEncoder encoder, SessaoRepository sessoes,
                           com.anaiv.fluxogestao.porto.PortoService porto) {
        veiculos=v; contratantes=c; categorias=ca; motoristas=m; usuarios=u; this.encoder=encoder; this.sessoes=sessoes; this.porto=porto;
    }
    @Transactional public VeiculoResponse criar(VeiculoRequest r) {
        return veiculo(new Veiculo(r.identificacao(), r.placa(), r.modelo(), r.custoPorKm(), r.siglaPorto()), true);
    }
    /**
     * Editar o veiculo e o que permite declarar a sigla da Porto num cadastro que ja existe -
     * sem isto, a frota cadastrada antes do painel diario ficaria sem de-para para sempre.
     */
    @Transactional public VeiculoResponse atualizarVeiculo(Long id, VeiculoRequest r) {
        Veiculo alvo = veiculos.findById(id).orElseThrow(() -> naoEncontrado("Veículo", id));
        validarSiglaPortoUnica(r.siglaPorto(), id);
        alvo.atualizar(r.identificacao(), r.placa(), r.modelo(), r.custoPorKm(), r.siglaPorto());
        return veiculo(alvo);
    }
    /** Duas viaturas com a mesma sigla fariam a importacao escolher a errada em silencio. */
    private void validarSiglaPortoUnica(String sigla, Long id) {
        if (sigla == null || sigla.isBlank()) return;
        veiculos.findFirstBySiglaPortoIgnoreCase(sigla.trim()).filter(x -> !x.getId().equals(id))
            .ifPresent(x -> { throw new IllegalArgumentException("A sigla " + sigla.trim().toUpperCase() + " já está em outra viatura (" + x.getIdentificacao() + ")."); });
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
        validarQraUnico(r.qra(), null);
        Motorista novo = motoristas.save(new Motorista(r.nome(), r.telefone(), r.documento(), r.qra(), usuario, obterVeiculo(r.veiculoId())));
        // Servicos desse QRA ja podem ter sido importados antes de a pessoa existir no sistema.
        porto.religarOrfasDoQra(novo);
        return motorista(novo);
    }
    @Transactional public MotoristaResponse atualizar(Long id, MotoristaRequest r) {
        Motorista alvo = motoristas.findById(id).orElseThrow(() -> naoEncontrado("Socorrista", id));
        validarQraUnico(r.qra(), id);
        alvo.atualizar(r.nome(), r.telefone(), r.documento(), r.qra(),
            r.usuarioId() == null ? null : usuario(r.usuarioId()), obterVeiculo(r.veiculoId()));
        // Corrigir ou preencher o QRA tem que valer para o que ja esta no banco, nao so para as
        // proximas importacoes: cada OS orfa desse QRA e comissao que a pessoa nao recebeu.
        porto.religarOrfasDoQra(alvo);
        return motorista(alvo);
    }
    @Transactional public MotoristaResponse desativar(Long id) { Motorista alvo = motoristas.findById(id).orElseThrow(() -> naoEncontrado("Socorrista", id)); alvo.desativar(); return motorista(alvo); }
    @Transactional public MotoristaResponse reativar(Long id) { Motorista alvo = motoristas.findById(id).orElseThrow(() -> naoEncontrado("Socorrista", id)); alvo.reativar(); porto.religarOrfasDoQra(alvo); return motorista(alvo); }
    /** O QRA e a identidade do socorrista na Porto: nao pode se repetir, nem depois de uma edicao. */
    private void validarQraUnico(String qra, Long id) {
        if (qra == null || qra.isBlank()) return;
        motoristas.findByQraIgnoreCase(qra.trim()).filter(x -> !x.getId().equals(id))
            .ifPresent(x -> { throw new IllegalArgumentException("Já existe um socorrista com este QRA."); });
    }
    public List<MotoristaResponse> motoristas() { return motoristas.findAllParaListagem().stream().map(this::motorista).toList(); }
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
    public VeiculoResponse veiculo(Veiculo v) { return new VeiculoResponse(v.getId(),v.getIdentificacao(),v.getPlaca(),v.getModelo(),v.getCustoPorKm(),v.getSiglaPorto(),v.isAtivo()); }
    public ContratanteResponse contratante(Contratante c) { return new ContratanteResponse(c.getId(),c.getNome(),c.getDocumento(),c.isAtivo()); }
    private CategoriaResponse categoria(Categoria c) { return new CategoriaResponse(c.getId(),c.getNome(),c.getTipo(),c.isAtivo()); }
    private MotoristaResponse motorista(Motorista m) { return new MotoristaResponse(m.getId(),m.getNome(),m.getTelefone(),m.getDocumento(),m.getQra(),m.getUsuario()==null?null:m.getUsuario().getId(),m.isAtivo(),
        m.getVeiculo()==null?null:m.getVeiculo().getId(), m.getVeiculo()==null?null:m.getVeiculo().getIdentificacao()); }
    /**
     * O dono nao ve nem escolhe a senha de ninguem: o sistema sorteia uma provisoria, devolve uma
     * unica vez para ele repassar, e derruba as sessoes daquele usuario. No proximo acesso a
     * pessoa e obrigada a trocar, entao a senha que passou pelo WhatsApp morre ali.
     */
    /**
     * Da acesso ao socorrista sem o dono escolher senha por ele: cria o usuario com perfil de
     * socorrista e senha provisoria, e vincula ao cadastro. A senha volta uma unica vez para o dono
     * repassar, e o proprio socorrista troca no primeiro acesso.
     */
    @Transactional public SenhaRedefinidaResponse criarAcesso(Long motoristaId, CriarAcessoRequest r) {
        Motorista alvo = motoristas.findById(motoristaId).orElseThrow(() -> naoEncontrado("Socorrista", motoristaId));
        if (alvo.getUsuario() != null) throw new IllegalArgumentException("Este socorrista já tem acesso ao sistema.");
        if (!alvo.isAtivo()) throw new IllegalArgumentException("Este socorrista está desativado e não pode receber acesso.");
        if (usuarios.findByEmailIgnoreCase(r.email()).isPresent()) throw new IllegalArgumentException("Já existe um usuário com este e-mail.");
        String provisoria = senhaProvisoria();
        String hash = encoder.encode(provisoria);
        Usuario acesso = new Usuario(alvo.getNome(), r.email(), hash, PerfilUsuario.FUNCIONARIO);
        acesso.definirSenhaProvisoria(hash);
        acesso = usuarios.save(acesso);
        alvo.atualizar(alvo.getNome(), alvo.getTelefone(), alvo.getDocumento(), alvo.getQra(), acesso, alvo.getVeiculo());
        return new SenhaRedefinidaResponse(acesso.getId(), acesso.getNome(), acesso.getEmail(), provisoria);
    }
    @Transactional public SenhaRedefinidaResponse redefinirSenha(Long id) {
        Usuario alvo = usuario(id);
        String provisoria = senhaProvisoria();
        alvo.definirSenhaProvisoria(encoder.encode(provisoria));
        sessoes.deleteByUsuario(alvo);
        return new SenhaRedefinidaResponse(alvo.getId(), alvo.getNome(), alvo.getEmail(), provisoria);
    }
    private String senhaProvisoria() {
        StringBuilder senha = new StringBuilder();
        for (int i = 0; i < 12; i++) {
            if (i > 0 && i % 4 == 0) senha.append('-');
            senha.append(ALFABETO.charAt(SORTEIO.nextInt(ALFABETO.length())));
        }
        return senha.toString();
    }
    private UsuarioResponse usuario(Usuario u) { return new UsuarioResponse(u.getId(),u.getNome(),u.getEmail(),u.getPerfil(),u.isAtivo(),u.isSenhaProvisoria()); }
}
