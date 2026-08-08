package com.anaiv.fluxogestao.service;

import com.anaiv.fluxogestao.dto.FinanceiroDtos.*;
import com.anaiv.fluxogestao.entity.*;
import com.anaiv.fluxogestao.entity.EnumsFinanceiros.*;
import com.anaiv.fluxogestao.exception.RecursoNaoEncontradoException;
import com.anaiv.fluxogestao.repository.*;
import com.anaiv.fluxogestao.security.UsuarioPrincipal;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

@Service
public class FinanceiroService {
    private final ContaReceberRepository contas; private final ReceitaRepository receitas;
    private final DespesaRepository despesas; private final CadastroService cadastros;
    public FinanceiroService(ContaReceberRepository c, ReceitaRepository r, DespesaRepository d, CadastroService cad) {
        contas=c; receitas=r; despesas=d; cadastros=cad;
    }

    @Transactional public ContaResponse criarConta(ContaRequest r) {
        return resposta(contas.save(novaConta(r, null)));
    }
    public ContaReceber novaConta(ContaRequest r, Importacao importacao) {
        return new ContaReceber(cadastros.obterContratante(r.contratanteId()), r.protocolo(), r.descricao(),
            r.valorPrevisto(), r.dataCompetencia(), r.vencimento(), cadastros.obterVeiculo(r.veiculoId()),
            r.observacoes(), r.origem(), importacao);
    }
    @Transactional public ContaReceber salvarImportada(ContaReceber conta) { return contas.save(conta); }
    @Transactional public List<ContaResponse> listarContas(StatusContaReceber status, String pesquisa) {
        LocalDate hoje=LocalDate.now(); contas.findAll().forEach(c->c.atualizarAtraso(hoje));
        String termo=pesquisa==null?"":pesquisa.toLowerCase();
        return contas.findAll().stream()
            .filter(c->status==null||c.getStatus()==status)
            .filter(c->termo.isBlank()||c.getDescricao().toLowerCase().contains(termo)
                ||(c.getProtocolo()!=null&&c.getProtocolo().toLowerCase().contains(termo))
                ||c.getContratante().getNome().toLowerCase().contains(termo))
            .sorted(Comparator.comparing(ContaReceber::getVencimento)).map(this::resposta).toList();
    }
    @Transactional public ContaResponse receber(Long id, RecebimentoRequest r) {
        ContaReceber c=conta(id); c.receber(r.valorRecebido(),r.dataRecebimento());
        receitas.save(new Receita(c,c.getContratante(),null,c.getDescricao(),r.valorRecebido(),
            c.getDataCompetencia(),r.dataRecebimento(),StatusReceita.RECEBIDA,false,c.getVeiculo(),c.getObservacoes()));
        return resposta(c);
    }
    @Transactional public ReceitaResponse criarReceita(ReceitaRequest r) {
        var receita=new Receita(null,r.contratanteId()==null?null:cadastros.obterContratante(r.contratanteId()),
            cadastros.obterCategoria(r.categoriaId()),r.descricao(),r.valor(),r.dataCompetencia(),
            r.dataRecebimento(),r.status(),r.recorrente(),cadastros.obterVeiculo(r.veiculoId()),r.observacoes());
        return resposta(receitas.save(receita));
    }
    public List<ReceitaResponse> listarReceitas() { return receitas.findAll().stream().map(this::resposta).toList(); }
    @Transactional public ReceitaResponse atualizarReceita(Long id,ReceitaRequest r){Receita receita=receita(id);receita.atualizarManual(
        r.contratanteId()==null?null:cadastros.obterContratante(r.contratanteId()),cadastros.obterCategoria(r.categoriaId()),r.descricao(),r.valor(),r.dataCompetencia(),r.dataRecebimento(),r.status(),r.recorrente(),cadastros.obterVeiculo(r.veiculoId()),r.observacoes());return resposta(receita);}
    @Transactional public void excluirReceita(Long id){Receita receita=receita(id);if(!receita.isManual())throw new IllegalArgumentException("Receitas originadas da Porto ou de importação não podem ser excluídas manualmente.");receitas.delete(receita);}
    @Transactional public DespesaResponse criarDespesa(DespesaRequest r, UsuarioPrincipal principal) {
        Categoria categoria=cadastros.obterCategoria(r.categoriaId());
        if(categoria.getTipo()!=TipoCategoria.DESPESA) throw new IllegalArgumentException("Selecione uma categoria de despesa.");
        Despesa d=new Despesa(r.descricao(),categoria,r.valor(),r.data(),r.vencimento(),r.dataPagamento(),
            r.formaPagamento(),cadastros.obterVeiculo(r.veiculoId()),cadastros.obterMotorista(r.motoristaId()),
            r.protocolo(),r.comprovante(),r.observacoes(),r.status(),cadastros.usuario(principal.id()));
        return resposta(despesas.save(d));
    }
    @Transactional public List<DespesaResponse> listarDespesas() {
        despesas.findAll().forEach(d->d.atualizarAtraso(LocalDate.now()));
        return despesas.findAll().stream().map(this::resposta).toList();
    }
    @Transactional public DespesaResponse aprovar(Long id, UsuarioPrincipal principal) {
        Despesa d=despesa(id); d.aprovar(cadastros.usuario(principal.id())); return resposta(d);
    }
    @Transactional public DespesaResponse rejeitar(Long id, UsuarioPrincipal principal) {
        Despesa d=despesa(id);
        if(d.getCriadoPor().getId().equals(principal.id())) throw new IllegalArgumentException("O funcionário não pode aprovar ou rejeitar o próprio lançamento.");
        d.rejeitar(cadastros.usuario(principal.id())); return resposta(d);
    }
    @Transactional public DespesaResponse pagar(Long id, PagamentoDespesaRequest r) {
        Despesa d=despesa(id);d.pagar(r.dataPagamento(),r.formaPagamento(),r.comprovante(),r.observacoes());return resposta(d);
    }
    @Transactional(readOnly=true) public List<LancamentoFinanceiroResponse> listarLancamentos(LocalDate inicio,LocalDate fim) {
        List<LancamentoFinanceiroResponse> itens=new ArrayList<>();
        receitas.findAll().stream().filter(r->r.getStatus()!=StatusReceita.CANCELADA).map(r->{
            boolean realizado=r.getStatus()==StatusReceita.RECEBIDA;
            LocalDate data=realizado&&r.getDataRecebimento()!=null?r.getDataRecebimento():r.getDataCompetencia();
            return new LancamentoFinanceiroResponse("RECEITA-"+r.getId(),"RECEITA",r.getId(),r.getDescricao(),
                r.getCategoria()==null?"Receita":r.getCategoria().getNome(),r.getValor(),data,r.getStatus().name(),realizado,
                r.getVeiculo()==null?null:r.getVeiculo().getIdentificacao(),r.getVeiculo()==null?null:r.getVeiculo().getId(),
                r.getMotorista()==null?null:r.getMotorista().getNome(),r.isManual()?"MANUAL":"PORTO",null);
        }).filter(l->entre(l.data(),inicio,fim)).forEach(itens::add);
        contas.findAll().stream().filter(c->c.getStatus()==StatusContaReceber.PENDENTE||c.getStatus()==StatusContaReceber.ATRASADO)
            .map(c->new LancamentoFinanceiroResponse("CONTA-"+c.getId(),"RECEITA",c.getId(),c.getDescricao(),"Conta a receber",
                c.getValorPrevisto(),c.getDataCompetencia(),c.getStatus().name(),false,
                c.getVeiculo()==null?null:c.getVeiculo().getIdentificacao(),c.getVeiculo()==null?null:c.getVeiculo().getId(),
                c.getMotorista()==null?null:c.getMotorista().getNome(),c.getOrigem().name(),c.getProtocolo()))
            .filter(l->entre(l.data(),inicio,fim)).forEach(itens::add);
        despesas.findAll().stream().filter(d->d.getStatus()!=StatusDespesa.REJEITADO).map(d->{
            boolean realizado=d.isAprovada()&&d.getStatus()==StatusDespesa.PAGO;
            LocalDate data=realizado&&d.getDataPagamento()!=null?d.getDataPagamento():(d.getVencimento()!=null?d.getVencimento():d.getData());
            return new LancamentoFinanceiroResponse("DESPESA-"+d.getId(),"DESPESA",d.getId(),d.getDescricao(),d.getCategoria().getNome(),
                d.getValor(),data,d.getStatus().name(),realizado,d.getVeiculo()==null?null:d.getVeiculo().getIdentificacao(),
                d.getVeiculo()==null?null:d.getVeiculo().getId(),d.getMotorista()==null?null:d.getMotorista().getNome(),"DESPESA",d.getProtocolo());
        }).filter(l->entre(l.data(),inicio,fim)).forEach(itens::add);
        return itens.stream().sorted(Comparator.comparing(LancamentoFinanceiroResponse::data).reversed()
            .thenComparing(LancamentoFinanceiroResponse::id,Comparator.reverseOrder())).toList();
    }
    public List<ContaReceber> contasEntidades() { return contas.findAll(); }
    public List<Receita> receitasEntidades() { return receitas.findAll(); }
    public List<Despesa> despesasEntidades() { return despesas.findAll(); }
    private ContaReceber conta(Long id){return contas.findById(id).orElseThrow(()->new RecursoNaoEncontradoException("Conta a receber não encontrada."));}
    private Despesa despesa(Long id){return despesas.findById(id).orElseThrow(()->new RecursoNaoEncontradoException("Despesa não encontrada."));}
    private Receita receita(Long id){return receitas.findById(id).orElseThrow(()->new RecursoNaoEncontradoException("Receita não encontrada."));}
    private boolean entre(LocalDate data,LocalDate inicio,LocalDate fim){return data!=null&&!data.isBefore(inicio)&&!data.isAfter(fim);}
    public ContaResponse resposta(ContaReceber c){return new ContaResponse(c.getId(),cadastros.contratante(c.getContratante()),c.getProtocolo(),
        c.getDescricao(),c.getValorPrevisto(),c.getValorRecebido(),c.diferenca(),c.getDataCompetencia(),c.getVencimento(),
        c.getDataRecebimento(),c.getStatus(),c.getVeiculo()==null?null:cadastros.veiculo(c.getVeiculo()),c.getObservacoes(),
        c.getOrigem(),c.getImportacao()==null?null:c.getImportacao().getId());}
    private ReceitaResponse resposta(Receita r){return new ReceitaResponse(r.getId(),r.getDescricao(),r.getValor(),r.getDataCompetencia(),
        r.getDataRecebimento(),r.getStatus(),r.isRecorrente(),r.getContratante()==null?null:r.getContratante().getNome(),r.getContratante()==null?null:r.getContratante().getId(),
        r.getCategoria()==null?null:r.getCategoria().getNome(),r.getCategoria()==null?null:r.getCategoria().getId(),r.getVeiculo()==null?null:r.getVeiculo().getIdentificacao(),r.getVeiculo()==null?null:r.getVeiculo().getId(),
        r.getContaReceber()==null?null:r.getContaReceber().getId(),r.getObservacoes(),r.isManual());}
    private DespesaResponse resposta(Despesa d){return new DespesaResponse(d.getId(),d.getDescricao(),d.getCategoria().getNome(),d.getValor(),
        d.getData(),d.getVencimento(),d.getDataPagamento(),d.getFormaPagamento(),d.getVeiculo()==null?null:d.getVeiculo().getIdentificacao(),
        d.getMotorista()==null?null:d.getMotorista().getNome(),d.getProtocolo(),d.getComprovante(),d.getObservacoes(),d.getStatus(),
        d.isAprovada(),d.getCriadoPor().getNome());}
}
