package com.anaiv.fluxogestao.comissao;

import com.anaiv.fluxogestao.auth.*;
import com.anaiv.fluxogestao.cadastro.*;
import com.anaiv.fluxogestao.comissao.*;
import com.anaiv.fluxogestao.financeiro.*;
import com.anaiv.fluxogestao.porto.*;
import com.anaiv.fluxogestao.comissao.ComissaoDtos.*;
import com.anaiv.fluxogestao.exception.RecursoNaoEncontradoException;
import com.anaiv.fluxogestao.security.UsuarioPrincipal;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.*;

import static com.anaiv.fluxogestao.financeiro.EnumsFinanceiros.*;

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
        Categoria categoria=categorias.findFirstByNomeIgnoreCaseAndTipo("Comissão de socorrista",TipoCategoria.DESPESA)
            .orElseThrow(()->new IllegalStateException("Categoria técnica de comissão não encontrada."));
        String protocolo="COMISSAO-"+motorista.getId()+"-"+periodo.getId();
        Despesa despesa=new Despesa("Comissão líquida - "+motorista.getNome(),categoria,comissao.liquido(),request.dataPagamento(),
            request.dataPagamento(),request.dataPagamento(),request.formaPagamento(),null,motorista,protocolo,null,request.observacoes(),StatusDespesa.PAGO,administrador);
        despesa.aprovar(administrador);despesas.save(despesa);
        return pagamento(pagamentos.save(new PagamentoComissao(motorista,periodo,despesa,comissao.liquido(),request.dataPagamento(),
            request.formaPagamento(),request.observacoes(),administrador)));
    }
    @Transactional(readOnly=true) public DetalheSocorristaResponse detalheSocorrista(Long calendarioPagamentoId,Long motoristaId){
        Motorista motorista=obterMotorista(motoristaId);
        CalendarioPagamentoPorto periodo=calendarios.obterPeriodo(calendarioPagamentoId);
        ComissaoResponse comissao=calcular(calendarioPagamentoId,motorista);
        Map<Long,ServicoComissaoResponse> pagos=new LinkedHashMap<>();
        comissao.servicos().forEach(servico->pagos.put(servico.id(),servico));
        Map<Long,OrdemServicoPorto> selecionados=new LinkedHashMap<>();
        List<OrdemServicoPorto> todos=oss.findByMotorista(motorista);
        todos.stream().filter(os->pagos.containsKey(os.getId())).forEach(os->selecionados.put(os.getId(),os));
        todos.stream().filter(os->estaNoPeriodo(os.getDataAtendimento(),periodo)).forEach(os->selecionados.putIfAbsent(os.getId(),os));
        List<ServicoSocorristaResponse> servicos=selecionados.values().stream()
            .sorted(Comparator.comparing(OrdemServicoPorto::getDataAtendimento,Comparator.nullsLast(Comparator.reverseOrder())))
            .map(os->servicoSocorrista(os,pagos.get(os.getId()))).toList();
        List<String> veiculos=servicos.stream().map(ServicoSocorristaResponse::viatura).filter(Objects::nonNull)
            .filter(viatura->!viatura.isBlank()).distinct().toList();
        Usuario usuario=motorista.getUsuario();
        return new DetalheSocorristaResponse(motorista.getId(),motorista.getNome(),motorista.isAtivo(),motorista.getTelefone(),
            usuario==null?null:usuario.getEmail(),motorista.getQra(),veiculos,servicos.size(),comissao,servicos);
    }
    /** Uma tela so, todos os socorristas: as tres consultas sao feitas em lote, nao por socorrista. */
    @Transactional(readOnly=true) public List<ResumoComissaoResponse> resumo(Long calendarioPagamentoId,Long motoristaId){
        CalendarioPagamentoPorto periodo=calendarios.obterPeriodo(calendarioPagamentoId);
        List<Motorista> equipe=motoristas.findAllParaListagem().stream().filter(m->motoristaId==null||m.getId().equals(motoristaId)).toList();
        if(equipe.isEmpty())return List.of();
        DadosDoPeriodo dados=carregar(equipe,periodo);
        // desativado sai da lista, menos quando trabalhou no periodo: a comissao dele ainda tem de ser conferida e paga
        return equipe.stream().filter(m->m.isAtivo()||!dados.servicosDe(m).isEmpty()).map(m->calcular(periodo,m,dados)).map(c->new ResumoComissaoResponse(c.motoristaId(),c.socorrista(),c.quantidadeServicosPagos(),c.producaoPaga(),c.comissaoBruta(),c.alimentacaoAprovada(),c.liquido(),c.pagamento())).toList();
    }
    private record DadosDoPeriodo(Map<Long,List<OrdemServicoPorto>> servicos,Map<Long,List<Despesa>> alimentacoes,Map<Long,PagamentoComissao> pagamentos){
        List<OrdemServicoPorto> servicosDe(Motorista m){return servicos.getOrDefault(m.getId(),List.of());}
        List<Despesa> alimentacoesDe(Motorista m){return alimentacoes.getOrDefault(m.getId(),List.of());}
        PagamentoComissao pagamentoDe(Motorista m){return pagamentos.get(m.getId());}
    }
    private DadosDoPeriodo carregar(List<Motorista> equipe,CalendarioPagamentoPorto periodo){
        Map<Long,List<OrdemServicoPorto>> servicos=oss.findPagasNoPeriodo(equipe,periodo,SituacaoFinanceiraOpPorto.RECEBIDO,StatusFinanceiroPorto.RECEBIDO)
            .stream().collect(java.util.stream.Collectors.groupingBy(x->x.getMotorista().getId(),LinkedHashMap::new,java.util.stream.Collectors.toList()));
        Map<Long,List<Despesa>> alimentacoes=despesas.findByMotoristaInAndNaturezaAndDataBetweenOrderByDataDesc(equipe,NaturezaDespesa.ALIMENTACAO_FUNCIONARIO,periodo.getCompetenciaInicio(),periodo.getCompetenciaFim())
            .stream().collect(java.util.stream.Collectors.groupingBy(x->x.getMotorista().getId(),LinkedHashMap::new,java.util.stream.Collectors.toList()));
        Map<Long,PagamentoComissao> pagos=pagamentos.findByCalendarioPagamento(periodo).stream()
            .collect(java.util.stream.Collectors.toMap(x->x.getMotorista().getId(),x->x,(a,b)->a));
        return new DadosDoPeriodo(servicos,alimentacoes,pagos);
    }
    @Transactional(readOnly=true) public String csv(Long calendarioPagamentoId){
        StringBuilder csv=new StringBuilder("\uFEFFSocorrista;Período;Serviços pagos;Produção paga;Comissão 20%;Alimentação;Líquido\r\n");
        for(ResumoComissaoResponse r:resumo(calendarioPagamentoId,null)){csv.append(campo(r.socorrista())).append(';').append(campo(calendarios.rotulo(calendarios.obterPeriodo(calendarioPagamentoId)))).append(';')
            .append(r.quantidadeServicosPagos()).append(';').append(r.producaoPaga()).append(';').append(r.comissaoBruta()).append(';').append(r.alimentacaoAprovada()).append(';').append(r.liquido()).append("\r\n");}
        return csv.toString();
    }
    private ComissaoResponse calcular(Long calendarioPagamentoId,Motorista motorista){
        CalendarioPagamentoPorto periodo=calendarios.obterPeriodo(calendarioPagamentoId);
        return calcular(periodo,motorista,carregar(List.of(motorista),periodo));
    }
    private ComissaoResponse calcular(CalendarioPagamentoPorto periodo,Motorista motorista,DadosDoPeriodo dados){
        List<OrdemServicoPorto> servicos=dados.servicosDe(motorista);
        BigDecimal producao=soma(servicos.stream().map(OrdemServicoPorto::getValorTotal).toList());BigDecimal bruta=producao.multiply(PERCENTUAL).setScale(2,RoundingMode.HALF_UP);
        List<Despesa> alimentacoes=dados.alimentacoesDe(motorista);
        BigDecimal aprovada=soma(alimentacoes.stream().filter(Despesa::isAprovada).filter(d->d.getStatus()!=StatusDespesa.REJEITADO).map(Despesa::getValor).toList());
        BigDecimal pendente=soma(alimentacoes.stream().filter(d->!d.isAprovada()).filter(d->d.getStatus()!=StatusDespesa.REJEITADO).map(Despesa::getValor).toList());
        List<ServicoComissaoResponse> detalhados=servicos.stream().map(os->new ServicoComissaoResponse(os.getId(),os.getNumero(),os.getEspecialidade(),os.getDataAtendimento(),os.getOrdemPagamento().getNumero(),os.getValorTotal(),os.getValorTotal().multiply(PERCENTUAL).setScale(2,RoundingMode.HALF_UP))).toList();
        PagamentoComissaoResponse pagamento=dados.pagamentoDe(motorista)==null?null:pagamento(dados.pagamentoDe(motorista));
        return new ComissaoResponse(periodo.getId(),calendarios.rotulo(periodo),motorista.getNome(),motorista.getId(),detalhados.size(),producao,PERCENTUAL,bruta,aprovada,pendente,bruta.subtract(aprovada),detalhados.isEmpty(),detalhados,alimentacoes.stream().map(this::alimentacao).toList(),pagamento);
    }
    private Motorista motoristaDoUsuario(UsuarioPrincipal principal){if(principal==null)throw new IllegalArgumentException("Usuário autenticado não identificado.");Usuario usuario=usuarios.findById(principal.id()).orElseThrow(()->new RecursoNaoEncontradoException("Usuário autenticado não encontrado."));return motoristas.findByUsuario(usuario).orElseThrow(()->new IllegalArgumentException("Seu usuário ainda não está vinculado a um motorista."));}
    private Motorista obterMotorista(Long id){return motoristas.findById(id).orElseThrow(()->new RecursoNaoEncontradoException("Motorista não encontrado."));}
    private boolean estaNoPeriodo(LocalDate data,CalendarioPagamentoPorto periodo){return data!=null&&!data.isBefore(periodo.getCompetenciaInicio())&&!data.isAfter(periodo.getCompetenciaFim());}
    private ServicoSocorristaResponse servicoSocorrista(OrdemServicoPorto os,ServicoComissaoResponse pago){
        boolean pagoNoPeriodo=pago!=null;
        String status=pagoNoPeriodo?"PAGO":os.getStatusFinanceiro()==StatusFinanceiroPorto.RECEBIDO?"PAGO_EM_OUTRO_PERIODO":"AGUARDANDO_PAGAMENTO";
        return new ServicoSocorristaResponse(os.getId(),os.getNumero(),os.getDataAtendimento(),os.getEspecialidade(),os.getSiglaViatura(),
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
