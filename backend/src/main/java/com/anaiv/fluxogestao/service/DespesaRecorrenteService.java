package com.anaiv.fluxogestao.service;

import com.anaiv.fluxogestao.dto.FinanceiroDtos.*;
import com.anaiv.fluxogestao.entity.*;
import com.anaiv.fluxogestao.entity.EnumsFinanceiros.StatusDespesa;
import com.anaiv.fluxogestao.entity.EnumsFinanceiros.TipoCategoria;
import com.anaiv.fluxogestao.exception.RecursoNaoEncontradoException;
import com.anaiv.fluxogestao.repository.DespesaRecorrenteRepository;
import com.anaiv.fluxogestao.repository.DespesaRepository;
import com.anaiv.fluxogestao.security.UsuarioPrincipal;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.Set;

/**
 * Custo fixo do mes: aluguel, seguro, parcela do guincho. O molde fica guardado e o mes e lancado
 * quando o dono manda, nao por um relogio - a Render hiberna e um agendador nao seria confiavel.
 * Lancar duas vezes o mesmo mes nao duplica nada.
 */
@Service
public class DespesaRecorrenteService {
    private final DespesaRecorrenteRepository moldes;
    private final DespesaRepository despesas;
    private final CadastroService cadastros;
    private final FinanceiroService financeiro;

    public DespesaRecorrenteService(DespesaRecorrenteRepository moldes, DespesaRepository despesas,
                                    CadastroService cadastros, FinanceiroService financeiro) {
        this.moldes = moldes; this.despesas = despesas; this.cadastros = cadastros; this.financeiro = financeiro;
    }

    @Transactional(readOnly = true) public List<DespesaRecorrenteResponse> listar() {
        return moldes.findAllParaListagem().stream().map(this::resposta).toList();
    }
    @Transactional public DespesaRecorrenteResponse criar(DespesaRecorrenteRequest r) {
        return resposta(moldes.save(new DespesaRecorrente(r.descricao(), categoriaDeDespesa(r.categoriaId()), r.valor(),
            r.diaVencimento(), cadastros.obterVeiculo(r.veiculoId()), cadastros.obterMotorista(r.motoristaId()), r.observacoes())));
    }
    @Transactional public DespesaRecorrenteResponse atualizar(Long id, DespesaRecorrenteRequest r) {
        DespesaRecorrente molde = obter(id);
        molde.atualizar(r.descricao(), categoriaDeDespesa(r.categoriaId()), r.valor(), r.diaVencimento(),
            cadastros.obterVeiculo(r.veiculoId()), cadastros.obterMotorista(r.motoristaId()), r.observacoes());
        return resposta(molde);
    }
    @Transactional public DespesaRecorrenteResponse desativar(Long id) { DespesaRecorrente m = obter(id); m.desativar(); return resposta(m); }
    @Transactional public DespesaRecorrenteResponse reativar(Long id) { DespesaRecorrente m = obter(id); m.reativar(); return resposta(m); }

    /**
     * Cria as despesas do mes a partir dos moldes ativos. Nascem pendentes de pagamento e ja
     * aprovadas: quem lanca e o dono, e o dashboard so conta despesa aprovada - sem isso o custo
     * fixo ficaria invisivel no resultado, que e justamente o que a recorrencia veio resolver.
     * O que muda de mes para mes e o pagamento, marcado na tela de despesas quando acontece.
     */
    @Transactional public LancamentoRecorrenteResponse lancar(YearMonth mes, UsuarioPrincipal principal) {
        Usuario responsavel = cadastros.usuario(principal.id());
        Set<Long> jaLancados = despesas
            .findByDespesaRecorrenteIsNotNullAndVencimentoBetween(mes.atDay(1), mes.atEndOfMonth())
            .stream().map(d -> d.getDespesaRecorrente().getId()).collect(java.util.stream.Collectors.toSet());
        List<DespesaRecorrente> pendentes = moldes.findAllParaListagem().stream()
            .filter(DespesaRecorrente::isAtivo).filter(m -> !jaLancados.contains(m.getId())).toList();
        List<DespesaResponse> criadas = pendentes.stream().map(m -> lancar(m, mes, responsavel)).toList();
        BigDecimal total = criadas.stream().map(DespesaResponse::valor).reduce(BigDecimal.ZERO, BigDecimal::add);
        return new LancamentoRecorrenteResponse(mes.toString(), criadas.size(), jaLancados.size(), total, criadas);
    }
    private DespesaResponse lancar(DespesaRecorrente molde, YearMonth mes, Usuario responsavel) {
        LocalDate vencimento = molde.vencimentoEm(mes);
        Despesa despesa = new Despesa(molde.getDescricao(), molde.getCategoria(), molde.getValor(), vencimento, vencimento,
            null, null, molde.getVeiculo(), molde.getMotorista(), null, null, molde.getObservacoes(),
            StatusDespesa.PENDENTE, responsavel);
        despesa.nasceuDe(molde);
        despesa.aprovar(responsavel);
        return financeiro.resposta(despesas.save(despesa));
    }

    private Categoria categoriaDeDespesa(Long id) {
        Categoria categoria = cadastros.obterCategoria(id);
        if (categoria.getTipo() != TipoCategoria.DESPESA) throw new IllegalArgumentException("Selecione uma categoria de despesa.");
        return categoria;
    }
    private DespesaRecorrente obter(Long id) {
        return moldes.findById(id).orElseThrow(() -> new RecursoNaoEncontradoException("Despesa fixa não encontrada."));
    }
    private DespesaRecorrenteResponse resposta(DespesaRecorrente m) {
        return new DespesaRecorrenteResponse(m.getId(), m.getDescricao(), m.getCategoria().getNome(), m.getCategoria().getId(),
            m.getValor(), m.getDiaVencimento(), m.getVeiculo() == null ? null : m.getVeiculo().getIdentificacao(),
            m.getVeiculo() == null ? null : m.getVeiculo().getId(), m.getMotorista() == null ? null : m.getMotorista().getNome(),
            m.getMotorista() == null ? null : m.getMotorista().getId(), m.getObservacoes(), m.isAtivo());
    }
}
