package com.anaiv.fluxogestao.service;

import com.anaiv.fluxogestao.dto.PortoDtos.*;
import com.anaiv.fluxogestao.dto.PortoImportacaoDtos.LinhaPorto;
import com.anaiv.fluxogestao.entity.*;
import com.anaiv.fluxogestao.exception.RecursoNaoEncontradoException;
import com.anaiv.fluxogestao.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.*;

@Service
public class PortoService {
    private final OrdemPagamentoPortoRepository ops; private final OrdemServicoPortoRepository oss;
    private final PendenciaFinanceiraPortoRepository pendencias;
    public PortoService(OrdemPagamentoPortoRepository ops,OrdemServicoPortoRepository oss,PendenciaFinanceiraPortoRepository p){this.ops=ops;this.oss=oss;pendencias=p;}
    public OrdemPagamentoPorto obterOp(Long id){return ops.findById(id).orElseThrow(()->new RecursoNaoEncontradoException("Ordem de pagamento não encontrada."));}
    public boolean existeOs(String numero){return numero!=null&&oss.findByNumero(numero).isPresent();}
    public boolean associacaoDivergente(String numero,Long ordemPagamentoId){return oss.findByNumero(numero).map(OrdemServicoPorto::getOrdemPagamento).filter(Objects::nonNull).map(OrdemPagamentoPorto::getId).filter(id->!id.equals(ordemPagamentoId)).isPresent();}
    public void importarOp(LinhaPorto l,Importacao i){String numero=l.texto("numero_op");OrdemPagamentoPorto op=ops.findByNumero(numero).orElseGet(()->new OrdemPagamentoPorto(numero,i));
        op.atualizar(l.decimal("valor_total"),l.texto("nome_codigo"),l.data("data_pagamento"),i);ops.save(op);}
    public void importarOs(LinhaPorto l,OrdemPagamentoPorto op,Importacao i){String numero=l.texto("numero_os");OrdemServicoPorto os=oss.findByNumero(numero).orElseGet(()->new OrdemServicoPorto(numero,i));
        os.atualizar(op,l.decimal("valor_total"),l.texto("especialidade"),l.texto("sigla_viatura"),l.texto("socorrista"),l.texto("qra"),
            l.data("data_atendimento"),l.decimal("valor_km_excedente"),l.decimal("km_morto_estimado"),i);oss.save(os);}
    public void importarDevolucao(LinhaPorto l,Importacao i){String numero=l.texto("numero_os");OrdemServicoPorto os=oss.findByNumero(numero).orElseGet(()->new OrdemServicoPorto(numero,i));
        os.atualizar(null,l.decimal("valor_total"),l.texto("especialidade"),null,null,null,l.data("data_atendimento"),null,null,i);os=oss.save(os);
        OrdemServicoPorto osSalva=os;PendenciaFinanceiraPorto p=pendencias.findByOrdemServico(osSalva).orElseGet(()->new PendenciaFinanceiraPorto(osSalva,l.decimal("valor_total"),l.data("data_devolucao"),i));
        p.atualizar(l.decimal("valor_total"),l.data("data_devolucao"),i);pendencias.save(p);}
    @Transactional(readOnly=true) public List<OrdemPagamentoResponse> listarOps(){return ops.findAll().stream().sorted(Comparator.comparing(OrdemPagamentoPorto::getNumero)).map(this::op).toList();}
    @Transactional(readOnly=true) public List<OrdemServicoResponse> listarOss(){return oss.findAll().stream().sorted(Comparator.comparing(OrdemServicoPorto::getNumero)).map(this::os).toList();}
    @Transactional(readOnly=true) public List<PendenciaResponse> listarPendencias(){List<PendenciaResponse> r=new ArrayList<>();ops.findAll().stream().filter(x->x.getDataRecebimento()==null)
        .forEach(x->r.add(new PendenciaResponse("RECEBIMENTO_OP",x.getId(),x.getNumero(),x.getValorTotal(),x.getDataPagamentoProgramada(),"ABERTA")));
        pendencias.findAll().stream().filter(x->x.getStatus()==EnumsFinanceiros.StatusPendenciaPorto.ABERTA).forEach(x->r.add(new PendenciaResponse(x.getTipo(),x.getOrdemServico().getId(),x.getOrdemServico().getNumero(),x.getValor(),x.getDataDevolucao(),x.getStatus().name())));
        return r.stream().sorted(Comparator.comparing(PendenciaResponse::data,Comparator.nullsLast(Comparator.naturalOrder()))).toList();}
    @Transactional public OrdemPagamentoResponse receber(Long id,RecebimentoRequest r){OrdemPagamentoPorto op=obterOp(id);op.confirmarRecebimento(r.valorRecebido(),r.dataRecebimento());return op(op);}
    private OrdemPagamentoResponse op(OrdemPagamentoPorto x){List<OrdemServicoPorto> vinculadas=oss.findByOrdemPagamento(x);BigDecimal soma=vinculadas.stream().map(OrdemServicoPorto::getValorTotal).filter(Objects::nonNull).reduce(BigDecimal.ZERO,BigDecimal::add);
        return new OrdemPagamentoResponse(x.getId(),x.getNumero(),x.getValorTotal(),x.getNomeCodigo(),x.getDataPagamentoProgramada(),x.getValorRecebido(),x.getDataRecebimento(),x.getDataRecebimento()==null?"PROGRAMADO":"RECEBIDO",vinculadas.size(),soma,x.getValorTotal().subtract(soma));}
    private OrdemServicoResponse os(OrdemServicoPorto x){OrdemPagamentoPorto op=x.getOrdemPagamento();return new OrdemServicoResponse(x.getId(),op==null?null:op.getId(),op==null?null:op.getNumero(),x.getNumero(),x.getValorTotal(),x.getEspecialidade(),x.getSiglaViatura(),x.getSocorrista(),x.getQra(),x.getDataAtendimento(),x.getValorKmExcedente(),x.getKmMortoEstimado());}
}
