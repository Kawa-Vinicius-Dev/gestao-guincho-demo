package com.anaiv.fluxogestao.service;

import com.anaiv.fluxogestao.dto.ComissaoDtos.*;
import com.anaiv.fluxogestao.entity.*;
import com.anaiv.fluxogestao.exception.RecursoNaoEncontradoException;
import com.anaiv.fluxogestao.repository.*;
import com.anaiv.fluxogestao.security.UsuarioPrincipal;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.*;

import static com.anaiv.fluxogestao.entity.EnumsFinanceiros.*;

@Service
public class ComissaoService {
    private static final BigDecimal PERCENTUAL=new BigDecimal("0.20");
    private final MotoristaRepository motoristas;private final UsuarioRepository usuarios;private final OrdemServicoPortoRepository oss;
    private final DespesaRepository despesas;private final CategoriaRepository categorias;private final CalendarioPortoService calendarios;
    private final PagamentoComissaoRepository pagamentos;
    public ComissaoService(MotoristaRepository motoristas,UsuarioRepository usuarios,OrdemServicoPortoRepository oss,
        DespesaRepository despesas,CategoriaRepository categorias,CalendarioPortoService calendarios,PagamentoComissaoRepository pagamentos){this.motoristas=motoristas;this.usuarios=usuarios;this.oss=oss;this.despesas=despesas;this.categorias=categorias;this.calendarios=calendarios;this.pagamentos=pagamentos;}

    @Transactional public AlimentacaoResponse registrarAlimentacao(AlimentacaoRequest request,UsuarioPrincipal principal){
        Motorista motorista=motoristaDoUsuario(principal);Usuario usuario=usuarios.findById(principal.id()).orElseThrow(()->new RecursoNaoEncontradoException("Usuário autenticado não encontrado."));
        Categoria categoria=categorias.findFirstByNomeIgnoreCaseAndTipo("Alimentação em serviço",TipoCategoria.DESPESA)
            .orElseGet(()->categorias.save(new Categoria("Alimentação em serviço",TipoCategoria.DESPESA)));
        Despesa despesa=new Despesa("Alimentação diária",categoria,request.valor(),request.data(),request.data(),null,null,null,motorista,
            null,null,request.observacoes(),StatusDespesa.PENDENTE,usuario);despesa.marcarComoAlimentacao();return alimentacao(despesas.save(despesa));
    }

    @Transactional(readOnly=true) public ComissaoResponse minha(Long calendarioPagamentoId,UsuarioPrincipal principal){return calcular(calendarioPagamentoId,motoristaDoUsuario(principal));}
    @Transactional(readOnly=true) public ComissaoResponse detalhe(Long calendarioPagamentoId,Long motoristaId){return calcular(calendarioPagamentoId,obterMotorista(motoristaId));}
    @Transactional public PagamentoComissaoResponse pagar(Long calendarioPagamentoId,Long motoristaId,PagamentoComissaoRequest request,UsuarioPrincipal principal){
        if(principal==null)throw new IllegalArgumentException("Usuário autenticado não identificado.");
        Motorista motorista=motoristas.findByIdForUpdate(motoristaId).orElseThrow(()->new RecursoNaoEncontradoException("Motorista não encontrado."));
        CalendarioPagamentoPorto periodo=calendarios.obterPeriodo(calendarioPagamentoId);
        Optional<PagamentoComissao> existente=pagamentos.findByMotoristaAndCalendarioPagamento(motorista,periodo);
        if(existente.isPresent())return pagamento(existente.get());
        ComissaoResponse comissao=calcular(calendarioPagamentoId,motorista);
        if(comissao.liquido().signum()<=0)throw new IllegalArgumentException("Não há valor líquido positivo de comissão para pagar neste período.");
        Usuario administrador=usuarios.findById(principal.id()).orElseThrow(()->new RecursoNaoEncontradoException("Usuário autenticado não encontrado."));
        Categoria categoria=categorias.findFirstByNomeIgnoreCaseAndTipo("Comissão de funcionário",TipoCategoria.DESPESA)
            .orElseThrow(()->new IllegalStateException("Categoria técnica de comissão não encontrada."));
        String protocolo="COMISSAO-"+motorista.getId()+"-"+periodo.getId();
        Despesa despesa=new Despesa("Comissão líquida - "+motorista.getNome(),categoria,comissao.liquido(),request.dataPagamento(),
            request.dataPagamento(),request.dataPagamento(),request.formaPagamento(),null,motorista,protocolo,null,request.observacoes(),StatusDespesa.PAGO,administrador);
        despesa.aprovar(administrador);despesas.save(despesa);
        return pagamento(pagamentos.save(new PagamentoComissao(motorista,periodo,despesa,comissao.liquido(),request.dataPagamento(),
            request.formaPagamento(),request.observacoes(),administrador)));
    }
    @Transactional(readOnly=true) public DetalheFuncionarioResponse detalheFuncionario(Long calendarioPagamentoId,Long motoristaId){
        Motorista motorista=obterMotorista(motoristaId);
        CalendarioPagamentoPorto periodo=calendarios.obterPeriodo(calendarioPagamentoId);
        ComissaoResponse comissao=calcular(calendarioPagamentoId,motorista);
        Map<Long,ServicoComissaoResponse> pagos=new LinkedHashMap<>();
        comissao.servicos().forEach(servico->pagos.put(servico.id(),servico));
        Map<Long,OrdemServicoPorto> selecionados=new LinkedHashMap<>();
        List<OrdemServicoPorto> todos=oss.findByMotorista(motorista);
        todos.stream().filter(os->pagos.containsKey(os.getId())).forEach(os->selecionados.put(os.getId(),os));
        todos.stream().filter(os->estaNoPeriodo(os.getDataAtendimento(),periodo)).forEach(os->selecionados.putIfAbsent(os.getId(),os));
        List<ServicoFuncionarioResponse> servicos=selecionados.values().stream()
            .sorted(Comparator.comparing(OrdemServicoPorto::getDataAtendimento,Comparator.nullsLast(Comparator.reverseOrder())))
            .map(os->servicoFuncionario(os,pagos.get(os.getId()))).toList();
        List<String> veiculos=servicos.stream().map(ServicoFuncionarioResponse::viatura).filter(Objects::nonNull)
            .filter(viatura->!viatura.isBlank()).distinct().toList();
        Usuario usuario=motorista.getUsuario();
        return new DetalheFuncionarioResponse(motorista.getId(),motorista.getNome(),motorista.isAtivo(),motorista.getTelefone(),
            usuario==null?null:usuario.getEmail(),motorista.getQra(),veiculos,servicos.size(),comissao,servicos);
    }
    @Transactional(readOnly=true) public List<ResumoComissaoResponse> resumo(Long calendarioPagamentoId,Long motoristaId){
        return motoristas.findAll().stream().filter(Motorista::isAtivo).filter(m->motoristaId==null||m.getId().equals(motoristaId))
            .map(m->calcular(calendarioPagamentoId,m)).map(c->new ResumoComissaoResponse(c.motoristaId(),c.funcionario(),c.quantidadeServicosPagos(),c.producaoPaga(),c.comissaoBruta(),c.alimentacaoAprovada(),c.liquido(),c.pagamento())).toList();
    }
    @Transactional(readOnly=true) public String csv(Long calendarioPagamentoId){
        StringBuilder csv=new StringBuilder("\uFEFFFuncionário;Período;Serviços pagos;Produção paga;Comissão 20%;Alimentação;Líquido\r\n");
        for(ResumoComissaoResponse r:resumo(calendarioPagamentoId,null)){csv.append(campo(r.funcionario())).append(';').append(campo(calendarios.rotulo(calendarios.obterPeriodo(calendarioPagamentoId)))).append(';')
            .append(r.quantidadeServicosPagos()).append(';').append(r.producaoPaga()).append(';').append(r.comissaoBruta()).append(';').append(r.alimentacaoAprovada()).append(';').append(r.liquido()).append("\r\n");}
        return csv.toString();
    }
    private ComissaoResponse calcular(Long calendarioPagamentoId,Motorista motorista){
        CalendarioPagamentoPorto periodo=calendarios.obterPeriodo(calendarioPagamentoId);
        List<OrdemServicoPorto> servicos=oss.findByMotorista(motorista).stream().filter(os->os.getOrdemPagamento()!=null)
            .filter(os->os.getOrdemPagamento().getCalendarioPagamento()!=null&&os.getOrdemPagamento().getCalendarioPagamento().getId().equals(periodo.getId()))
            .filter(os->os.getOrdemPagamento().getSituacaoFinanceira()==SituacaoFinanceiraOpPorto.RECEBIDO&&os.getStatusFinanceiro()==StatusFinanceiroPorto.RECEBIDO)
            .collect(java.util.stream.Collectors.toMap(OrdemServicoPorto::getId,x->x,(a,b)->a,LinkedHashMap::new)).values().stream().toList();
        BigDecimal producao=soma(servicos.stream().map(OrdemServicoPorto::getValorTotal).toList());BigDecimal bruta=producao.multiply(PERCENTUAL).setScale(2,RoundingMode.HALF_UP);
        List<Despesa> alimentacoes=despesas.findByMotoristaAndNaturezaAndDataBetweenOrderByDataDesc(motorista,NaturezaDespesa.ALIMENTACAO_FUNCIONARIO,periodo.getCompetenciaInicio(),periodo.getCompetenciaFim());
        BigDecimal aprovada=soma(alimentacoes.stream().filter(Despesa::isAprovada).filter(d->d.getStatus()!=StatusDespesa.REJEITADO).map(Despesa::getValor).toList());
        BigDecimal pendente=soma(alimentacoes.stream().filter(d->!d.isAprovada()).filter(d->d.getStatus()!=StatusDespesa.REJEITADO).map(Despesa::getValor).toList());
        List<ServicoComissaoResponse> detalhados=servicos.stream().map(os->new ServicoComissaoResponse(os.getId(),os.getNumero(),os.getEspecialidade(),os.getDataAtendimento(),os.getOrdemPagamento().getNumero(),os.getValorTotal(),os.getValorTotal().multiply(PERCENTUAL).setScale(2,RoundingMode.HALF_UP))).toList();
        PagamentoComissaoResponse pagamento=pagamentos.findByMotoristaAndCalendarioPagamento(motorista,periodo).map(this::pagamento).orElse(null);
        return new ComissaoResponse(periodo.getId(),calendarios.rotulo(periodo),motorista.getNome(),motorista.getId(),detalhados.size(),producao,PERCENTUAL,bruta,aprovada,pendente,bruta.subtract(aprovada),detalhados.isEmpty(),detalhados,alimentacoes.stream().map(this::alimentacao).toList(),pagamento);
    }
    private Motorista motoristaDoUsuario(UsuarioPrincipal principal){if(principal==null)throw new IllegalArgumentException("Usuário autenticado não identificado.");Usuario usuario=usuarios.findById(principal.id()).orElseThrow(()->new RecursoNaoEncontradoException("Usuário autenticado não encontrado."));return motoristas.findByUsuario(usuario).orElseThrow(()->new IllegalArgumentException("Seu usuário ainda não está vinculado a um motorista."));}
    private Motorista obterMotorista(Long id){return motoristas.findById(id).orElseThrow(()->new RecursoNaoEncontradoException("Motorista não encontrado."));}
    private boolean estaNoPeriodo(LocalDate data,CalendarioPagamentoPorto periodo){return data!=null&&!data.isBefore(periodo.getCompetenciaInicio())&&!data.isAfter(periodo.getCompetenciaFim());}
    private ServicoFuncionarioResponse servicoFuncionario(OrdemServicoPorto os,ServicoComissaoResponse pago){
        boolean pagoNoPeriodo=pago!=null;
        String status=pagoNoPeriodo?"PAGO":os.getStatusFinanceiro()==StatusFinanceiroPorto.RECEBIDO?"PAGO_EM_OUTRO_PERIODO":"AGUARDANDO_PAGAMENTO";
        return new ServicoFuncionarioResponse(os.getId(),os.getNumero(),os.getDataAtendimento(),os.getEspecialidade(),os.getSiglaViatura(),
            os.getOrdemPagamento()==null?null:os.getOrdemPagamento().getNumero(),os.getValorTotal(),status,pagoNoPeriodo,
            pagoNoPeriodo?pago.comissaoServico():null);
    }
    private AlimentacaoResponse alimentacao(Despesa d){return new AlimentacaoResponse(d.getId(),d.getMotorista().getId(),d.getData(),d.getValor(),d.getStatus().name(),d.isAprovada(),d.getObservacoes());}
    private PagamentoComissaoResponse pagamento(PagamentoComissao p){return new PagamentoComissaoResponse(p.getId(),p.getMotorista().getId(),
        p.getCalendarioPagamento().getId(),p.getDespesa().getId(),p.getValorPago(),p.getDataPagamento(),p.getFormaPagamento(),
        p.getObservacoes(),p.getPagoPor().getNome(),p.getCriadoEm());}
    private BigDecimal soma(Collection<BigDecimal> valores){return valores.stream().filter(Objects::nonNull).reduce(BigDecimal.ZERO,BigDecimal::add);}
    private String campo(Object valor){return "\""+Objects.toString(valor,"").replace("\"","\"\"")+"\"";}
}
