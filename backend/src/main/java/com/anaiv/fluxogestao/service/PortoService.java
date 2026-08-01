package com.anaiv.fluxogestao.service;

import com.anaiv.fluxogestao.dto.PortoDtos.*;
import com.anaiv.fluxogestao.dto.PortoImportacaoDtos.AcaoLinhaPorto;
import com.anaiv.fluxogestao.dto.PortoImportacaoDtos.LinhaPorto;
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

@Service
public class PortoService {
    private final OrdemPagamentoPortoRepository ops; private final OrdemServicoPortoRepository oss;
    private final PendenciaFinanceiraPortoRepository pendencias;private final JustificativaConciliacaoPortoRepository justificativas;private final UsuarioRepository usuarios;
    public PortoService(OrdemPagamentoPortoRepository ops,OrdemServicoPortoRepository oss,PendenciaFinanceiraPortoRepository p,JustificativaConciliacaoPortoRepository j,UsuarioRepository u){this.ops=ops;this.oss=oss;pendencias=p;justificativas=j;usuarios=u;}
    public OrdemPagamentoPorto obterOp(Long id){return ops.findById(id).orElseThrow(()->new RecursoNaoEncontradoException("Ordem de pagamento não encontrada."));}
    public boolean existeOp(String numero){return numero!=null&&ops.findByNumero(numero).isPresent();}
    public boolean existeOs(String numero){return numero!=null&&oss.findByNumero(numero).isPresent();}
    public AcaoLinhaPorto classificarOp(LinhaPorto linha){return ops.findByNumero(linha.texto("numero_op")).map(op->{
        boolean mudou=diferente(op.getValorTotal(),linha.decimal("valor_total"))
            ||diferenteSeInformado(op.getNomeCodigo(),linha.texto("nome_codigo"))
            ||!Objects.equals(op.getDataPagamentoProgramada(),linha.data("data_pagamento"));
        return mudou?AcaoLinhaPorto.ATUALIZAR:AcaoLinhaPorto.IGNORAR;
    }).orElse(AcaoLinhaPorto.IMPORTAR);}
    public AcaoLinhaPorto classificarOsGeral(LinhaPorto linha){return oss.findByNumero(linha.texto("numero_os")).map(os->{
        boolean mudou=diferente(os.getValorTotal(),linha.decimal("valor_total"))
            ||diferenteSeInformado(os.getEspecialidade(),linha.texto("especialidade"))
            ||diferenteSeInformado(os.getSiglaViatura(),linha.texto("sigla_viatura"))
            ||diferenteSeInformado(os.getSocorrista(),linha.texto("socorrista"))
            ||diferenteSeInformado(os.getQra(),linha.texto("qra"))
            ||!Objects.equals(os.getDataAtendimento(),linha.data("data_atendimento"));
        return mudou?AcaoLinhaPorto.DIVERGENCIA:AcaoLinhaPorto.IGNORAR;
    }).orElse(AcaoLinhaPorto.IMPORTAR);}
    public boolean associacaoDivergente(String numero,Long ordemPagamentoId){return oss.findByNumero(numero).map(OrdemServicoPorto::getOrdemPagamento).filter(Objects::nonNull).map(OrdemPagamentoPorto::getId).filter(id->!id.equals(ordemPagamentoId)).isPresent();}
    public void importarOp(LinhaPorto l,Importacao i){String numero=l.texto("numero_op");OrdemPagamentoPorto op=ops.findByNumero(numero).orElseGet(()->new OrdemPagamentoPorto(numero,i));
        op.atualizar(l.decimal("valor_total"),l.texto("nome_codigo"),l.data("data_pagamento"),i);ops.save(op);}
    public void importarOs(LinhaPorto l,OrdemPagamentoPorto op,Importacao i){String numero=l.texto("numero_os");OrdemServicoPorto os=oss.findByNumero(numero).orElseGet(()->new OrdemServicoPorto(numero,i));
        os.atualizar(op,l.decimal("valor_total"),l.texto("especialidade"),l.texto("sigla_viatura"),l.texto("socorrista"),l.texto("qra"),
            l.data("data_atendimento"),l.decimal("valor_km_excedente"),l.decimal("km_morto_estimado"),i);oss.save(os);}
    public void importarOsGeral(LinhaPorto l,Importacao i){String numero=l.texto("numero_os");OrdemServicoPorto os=oss.findByNumero(numero).orElseGet(()->new OrdemServicoPorto(numero,i));
        os.atualizar(null,l.decimal("valor_total"),l.texto("especialidade"),l.texto("sigla_viatura"),l.texto("socorrista"),l.texto("qra"),
            l.data("data_atendimento"),l.decimal("valor_km_excedente"),l.decimal("km_morto_estimado"),i);oss.save(os);}
    public void importarDevolucao(LinhaPorto l,Importacao i){String numero=l.texto("numero_os");OrdemServicoPorto os=oss.findByNumero(numero).orElseGet(()->new OrdemServicoPorto(numero,i));
        os.atualizar(null,l.decimal("valor_total"),l.texto("especialidade"),null,null,null,l.data("data_atendimento"),null,null,i);os=oss.save(os);
        os.finalizarDevolucao(l.decimal("valor_total"),l.data("data_devolucao"),l.data("data_finalizacao"),i);oss.save(os);
        pendencias.findByOrdemServico(os).ifPresent(p->{p.resolver();pendencias.save(p);});}
    @Transactional(readOnly=true) public List<OrdemPagamentoResponse> listarOps(){return listarOps(new PortoFiltros(null,null,null,null,null,null,null,null,null));}
    @Transactional(readOnly=true) public List<OrdemPagamentoResponse> listarOps(PortoFiltros filtros){PortoFiltros f=filtros==null?new PortoFiltros(null,null,null,null,null,null,null,null,null):filtros;
        return ops.findAll().stream().sorted(Comparator.comparing(OrdemPagamentoPorto::getNumero)).map(this::op)
            .filter(x->filtrar(x,f)).toList();}
    @Transactional(readOnly=true) public ResumoOrdensPagamentoResponse resumo(PortoFiltros filtros){List<OrdemPagamentoResponse> lista=listarOps(filtros);LocalDate hoje=LocalDate.now();
        List<OrdemPagamentoResponse> semComposicao=lista.stream().filter(x->x.quantidadeOrdensServico()==0).toList();
        List<OrdemPagamentoResponse> conciliadas=lista.stream().filter(x->x.statusConciliacao()==EnumsFinanceiros.StatusConciliacaoPorto.CONCILIADA).toList();
        List<OrdemPagamentoResponse> abaixo=lista.stream().filter(x->x.statusConciliacao()==EnumsFinanceiros.StatusConciliacaoPorto.VALOR_ABAIXO).toList();
        List<OrdemPagamentoResponse> acima=lista.stream().filter(x->x.statusConciliacao()==EnumsFinanceiros.StatusConciliacaoPorto.VALOR_ACIMA).toList();
        List<OrdemPagamentoResponse> divergentes=lista.stream().filter(this::temDivergencia).toList();
        List<OrdemPagamentoResponse> programadas=lista.stream().filter(x->x.dataPagamentoProgramada()!=null).toList();
        List<OrdemPagamentoResponse> recebidas=lista.stream().filter(x->x.dataRecebimento()!=null).toList();
        List<OrdemPagamentoResponse> aguardando=lista.stream().filter(x->x.dataRecebimento()==null).toList();
        List<OrdemPagamentoResponse> vencidas=lista.stream().filter(x->x.dataRecebimento()==null&&x.dataPagamentoProgramada()!=null&&x.dataPagamentoProgramada().isBefore(hoje)).toList();
        BigDecimal previsto=somarPrevisto(lista);BigDecimal medio=lista.isEmpty()?BigDecimal.ZERO:previsto.divide(BigDecimal.valueOf(lista.size()),2,RoundingMode.HALF_UP);
        return new ResumoOrdensPagamentoResponse(lista.size(),previsto,semComposicao.size(),somarPrevisto(semComposicao),conciliadas.size(),somarPrevisto(conciliadas),
            abaixo.size(),somarDivergencia(abaixo),acima.size(),somarDivergencia(acima),divergentes.size(),somarDivergencia(divergentes),
            programadas.size(),somarPrevisto(programadas),recebidas.size(),somarRecebido(recebidas),aguardando.size(),somarPrevisto(aguardando),
            vencidas.size(),somarPrevisto(vencidas),medio,lista.stream().mapToLong(OrdemPagamentoResponse::quantidadeOrdensServico).sum());}
    @Transactional(readOnly=true) public List<OrdemServicoResponse> listarOss(){return oss.findAll().stream().sorted(Comparator.comparing(OrdemServicoPorto::getNumero)).map(this::os).toList();}
    @Transactional(readOnly=true) public List<PendenciaResponse> listarPendencias(){List<PendenciaResponse> r=new ArrayList<>();ops.findAll().stream().filter(x->x.getDataRecebimento()==null)
        .forEach(x->r.add(new PendenciaResponse("RECEBIMENTO_OP",x.getId(),x.getNumero(),x.getValorTotal(),x.getDataPagamentoProgramada(),"ABERTA")));
        pendencias.findAll().stream().filter(x->x.getStatus()==EnumsFinanceiros.StatusPendenciaPorto.ABERTA).forEach(x->r.add(new PendenciaResponse(x.getTipo(),x.getOrdemServico().getId(),x.getOrdemServico().getNumero(),x.getValor(),x.getDataDevolucao(),x.getStatus().name())));
        return r.stream().sorted(Comparator.comparing(PendenciaResponse::data,Comparator.nullsLast(Comparator.naturalOrder()))).toList();}
    @Transactional public OrdemPagamentoResponse receber(Long id,RecebimentoRequest r){OrdemPagamentoPorto op=obterOp(id);op.confirmarRecebimento(r.valorRecebido(),r.dataRecebimento());oss.findByOrdemPagamento(op).forEach(OrdemServicoPorto::marcarRecebida);return op(op);}
    @Transactional(readOnly=true) public OrdemPagamentoDetalheResponse detalhar(Long id){OrdemPagamentoPorto ordem=obterOp(id);return new OrdemPagamentoDetalheResponse(op(ordem),oss.findByOrdemPagamento(ordem).stream().map(this::os).toList(),justificativas.findByOrdemPagamentoOrderByCriadoEmDesc(ordem).stream().map(this::justificativa).toList());}
    @Transactional public JustificativaResponse justificar(Long id,JustificativaRequest request,UsuarioPrincipal principal){OrdemPagamentoPorto ordem=obterOp(id);Usuario usuario=usuarios.findById(principal.id()).orElseThrow(()->new RecursoNaoEncontradoException("Usuário autenticado não encontrado."));
        return justificativa(justificativas.save(new JustificativaConciliacaoPorto(ordem,request.motivo(),request.observacao().trim(),usuario)));}
    private OrdemPagamentoResponse op(OrdemPagamentoPorto x){List<OrdemServicoPorto> vinculadas=oss.findByOrdemPagamento(x);BigDecimal soma=vinculadas.stream().map(OrdemServicoPorto::getValorTotal).filter(Objects::nonNull).reduce(BigDecimal.ZERO,BigDecimal::add);BigDecimal diferenca=x.getValorTotal().subtract(soma);
        EnumsFinanceiros.StatusConciliacaoPorto status=vinculadas.isEmpty()?EnumsFinanceiros.StatusConciliacaoPorto.SEM_COMPOSICAO:diferenca.abs().compareTo(new BigDecimal("0.01"))<=0?EnumsFinanceiros.StatusConciliacaoPorto.CONCILIADA:diferenca.signum()>0?EnumsFinanceiros.StatusConciliacaoPorto.VALOR_ABAIXO:EnumsFinanceiros.StatusConciliacaoPorto.VALOR_ACIMA;
        if(x.getValorRecebido()!=null&&x.getValorRecebido().compareTo(x.getValorTotal())!=0)status=EnumsFinanceiros.StatusConciliacaoPorto.RECEBIDA_COM_DIVERGENCIA;
        return new OrdemPagamentoResponse(x.getId(),x.getNumero(),x.getValorTotal(),x.getNomeCodigo(),x.getDataPagamentoProgramada(),x.getValorRecebido(),x.getDataRecebimento(),x.getDataRecebimento()==null?"PROGRAMADO":"RECEBIDO",vinculadas.size(),soma,diferenca,status);}
    private OrdemServicoResponse os(OrdemServicoPorto x){OrdemPagamentoPorto op=x.getOrdemPagamento();return new OrdemServicoResponse(x.getId(),op==null?null:op.getId(),op==null?null:op.getNumero(),x.getNumero(),x.getValorTotal(),x.getEspecialidade(),x.getSiglaViatura(),x.getSocorrista(),x.getQra(),x.getDataAtendimento(),x.getValorKmExcedente(),x.getKmMortoEstimado(),x.getStatusOperacional(),x.getStatusFinanceiro(),x.getDataDevolucao(),x.getDataFinalizacaoDevolucao());}
    private boolean filtrar(OrdemPagamentoResponse x,PortoFiltros f){LocalDate hoje=LocalDate.now();boolean vencida=x.dataRecebimento()==null&&x.dataPagamentoProgramada()!=null&&x.dataPagamentoProgramada().isBefore(hoje);
        if(f.dataInicio()!=null&&(x.dataPagamentoProgramada()==null||x.dataPagamentoProgramada().isBefore(f.dataInicio())))return false;
        if(f.dataFim()!=null&&(x.dataPagamentoProgramada()==null||x.dataPagamentoProgramada().isAfter(f.dataFim())))return false;
        if(f.numero()!=null&&!f.numero().isBlank()&&!x.numero().toLowerCase(Locale.ROOT).contains(f.numero().trim().toLowerCase(Locale.ROOT)))return false;
        if(f.situacaoPagamento()!=null&&!f.situacaoPagamento().isBlank()){String situacao=f.situacaoPagamento().trim().toUpperCase(Locale.ROOT);if(situacao.equals("VENCIDA")&&!vencida)return false;if(situacao.equals("AGUARDANDO_RECEBIMENTO")&&(x.dataRecebimento()!=null||vencida))return false;if(!situacao.equals("VENCIDA")&&!situacao.equals("AGUARDANDO_RECEBIMENTO")&&!situacao.equals(x.situacao()))return false;}
        if(f.statusConciliacao()!=null&&f.statusConciliacao()!=x.statusConciliacao())return false;
        if(f.recebida()!=null&&f.recebida()!=(x.dataRecebimento()!=null))return false;
        if(f.vencida()!=null&&f.vencida()!=vencida)return false;
        if(f.comComposicao()!=null&&f.comComposicao()!=(x.quantidadeOrdensServico()>0))return false;
        return f.comDivergencia()==null||f.comDivergencia()==temDivergencia(x);}
    private boolean temDivergencia(OrdemPagamentoResponse x){return x.statusConciliacao()==EnumsFinanceiros.StatusConciliacaoPorto.VALOR_ABAIXO||x.statusConciliacao()==EnumsFinanceiros.StatusConciliacaoPorto.VALOR_ACIMA||x.statusConciliacao()==EnumsFinanceiros.StatusConciliacaoPorto.RECEBIDA_COM_DIVERGENCIA;}
    private BigDecimal somarPrevisto(Collection<OrdemPagamentoResponse> itens){return itens.stream().map(OrdemPagamentoResponse::valorTotal).filter(Objects::nonNull).reduce(BigDecimal.ZERO,BigDecimal::add);}
    private BigDecimal somarRecebido(Collection<OrdemPagamentoResponse> itens){return itens.stream().map(OrdemPagamentoResponse::valorRecebido).filter(Objects::nonNull).reduce(BigDecimal.ZERO,BigDecimal::add);}
    private BigDecimal somarDivergencia(Collection<OrdemPagamentoResponse> itens){return itens.stream().map(OrdemPagamentoResponse::divergencia).filter(Objects::nonNull).map(BigDecimal::abs).reduce(BigDecimal.ZERO,BigDecimal::add);}
    private boolean diferente(BigDecimal atual,BigDecimal novo){return novo!=null&&(atual==null||atual.compareTo(novo)!=0);}
    private boolean diferenteSeInformado(String atual,String novo){return novo!=null&&!Objects.equals(atual,novo);}
    private JustificativaResponse justificativa(JustificativaConciliacaoPorto x){return new JustificativaResponse(x.getId(),x.getMotivo(),x.getObservacao(),x.getUsuario().getNome(),x.getCriadoEm());}
}
