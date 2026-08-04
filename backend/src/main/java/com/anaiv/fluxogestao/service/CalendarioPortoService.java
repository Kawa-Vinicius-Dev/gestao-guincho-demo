package com.anaiv.fluxogestao.service;

import com.anaiv.fluxogestao.dto.PortoDtos.CalendarioRequest;
import com.anaiv.fluxogestao.dto.PortoDtos.CalendarioResponse;
import com.anaiv.fluxogestao.entity.CalendarioPagamentoPorto;
import com.anaiv.fluxogestao.exception.RecursoNaoEncontradoException;
import com.anaiv.fluxogestao.repository.CalendarioPagamentoPortoRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDate;
import java.util.List;

@Service
public class CalendarioPortoService {
    private final CalendarioPagamentoPortoRepository repositorio;
    public CalendarioPortoService(CalendarioPagamentoPortoRepository repositorio){this.repositorio=repositorio;}
    @Transactional(readOnly=true) public List<CalendarioResponse> listar(){return repositorio.findAllByOrderByDataPagamento().stream().map(this::resposta).toList();}
    @Transactional public CalendarioResponse criar(CalendarioRequest request){validarDataUnica(request.dataPagamento(),null);return resposta(repositorio.save(new CalendarioPagamentoPorto(request.dataPagamento(),request.descricao(),request.ativo())));}
    @Transactional public CalendarioResponse atualizar(Long id,CalendarioRequest request){CalendarioPagamentoPorto item=obter(id);validarDataUnica(request.dataPagamento(),id);item.atualizar(request.dataPagamento(),request.descricao(),request.ativo());return resposta(item);}
    @Transactional public CalendarioResponse desativar(Long id){CalendarioPagamentoPorto item=obter(id);item.desativar();return resposta(item);}
    @Transactional(readOnly=true) public LocalDate proximaDataAtiva(LocalDate data){return repositorio.findFirstByAtivoTrueAndDataPagamentoAfterOrderByDataPagamento(data).orElseThrow(()->new IllegalArgumentException("Não há data ativa posterior no calendário Porto.")).getDataPagamento();}
    @Transactional(readOnly=true) public int ciclosUltrapassados(LocalDate prevista,LocalDate efetiva){if(prevista==null||efetiva==null||!efetiva.isAfter(prevista))return 0;return repositorio.findByAtivoTrueAndDataPagamentoAfterAndDataPagamentoLessThanEqualOrderByDataPagamento(prevista,efetiva).size();}
    private void validarDataUnica(LocalDate data,Long id){repositorio.findByDataPagamento(data).filter(x->!x.getId().equals(id)).ifPresent(x->{throw new IllegalArgumentException("Já existe um ciclo Porto nesta data.");});}
    private CalendarioPagamentoPorto obter(Long id){return repositorio.findById(id).orElseThrow(()->new RecursoNaoEncontradoException("Data do calendário Porto não encontrada."));}
    private CalendarioResponse resposta(CalendarioPagamentoPorto x){return new CalendarioResponse(x.getId(),x.getDataPagamento(),x.getDescricao(),x.isAtivo(),x.getCriadoEm(),x.getAtualizadoEm());}
}
