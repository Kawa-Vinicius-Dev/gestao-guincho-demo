package com.anaiv.fluxogestao.service;

import com.anaiv.fluxogestao.dto.PortoDtos.CalendarioRequest;
import com.anaiv.fluxogestao.dto.PortoDtos.CalendarioResponse;
import com.anaiv.fluxogestao.entity.CalendarioPagamentoPorto;
import com.anaiv.fluxogestao.exception.RecursoNaoEncontradoException;
import com.anaiv.fluxogestao.repository.CalendarioPagamentoPortoRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;

@Service
public class CalendarioPortoService {
    private final CalendarioPagamentoPortoRepository repositorio;
    public CalendarioPortoService(CalendarioPagamentoPortoRepository repositorio){this.repositorio=repositorio;}
    @Transactional(readOnly=true) public List<CalendarioResponse> listar(){return repositorio.findAllByOrderByDataPagamento().stream().map(this::resposta).toList();}
    @Transactional public CalendarioResponse criar(CalendarioRequest request){validar(request,null);return resposta(repositorio.save(new CalendarioPagamentoPorto(request.dataPagamento(),request.competenciaInicio(),request.competenciaFim(),request.descricao(),request.ativo())));}
    @Transactional public CalendarioResponse atualizar(Long id,CalendarioRequest request){CalendarioPagamentoPorto item=obter(id);validar(request,id);item.atualizar(request.dataPagamento(),request.competenciaInicio(),request.competenciaFim(),request.descricao(),request.ativo());return resposta(item);}
    @Transactional public CalendarioResponse desativar(Long id){CalendarioPagamentoPorto item=obter(id);item.desativar();return resposta(item);}
    @Transactional(readOnly=true) public LocalDate proximaDataAtiva(LocalDate data){return repositorio.findFirstByAtivoTrueAndDataPagamentoAfterOrderByDataPagamento(data).orElseThrow(()->new IllegalArgumentException("Não há data ativa posterior no calendário Porto.")).getDataPagamento();}
    @Transactional(readOnly=true) public int ciclosUltrapassados(LocalDate prevista,LocalDate efetiva){if(prevista==null||efetiva==null||!efetiva.isAfter(prevista))return 0;return repositorio.findByAtivoTrueAndDataPagamentoAfterAndDataPagamentoLessThanEqualOrderByDataPagamento(prevista,efetiva).size();}
    @Transactional(readOnly=true) public CalendarioPagamentoPorto pagamentoDaCompetencia(LocalDate dataServico){
        PeriodoQuinzena periodo=periodo(dataServico);
        return repositorio.findFirstByAtivoTrueAndCompetenciaInicioLessThanEqualAndCompetenciaFimGreaterThanEqualOrderByDataPagamento(dataServico,dataServico)
            .filter(x->periodo.inicio().equals(x.getCompetenciaInicio())&&periodo.fim().equals(x.getCompetenciaFim()))
            .orElseThrow(()->new IllegalArgumentException("Não existe data ativa no calendário Porto para o período "+periodo.rotulo()+"."));
    }
    public PeriodoQuinzena periodo(LocalDate data){if(data==null)throw new IllegalArgumentException("A data de atendimento é obrigatória para localizar o calendário Porto.");LocalDate inicio=data.getDayOfMonth()<=15?data.withDayOfMonth(1):data.withDayOfMonth(16);LocalDate fim=data.getDayOfMonth()<=15?data.withDayOfMonth(15):data.withDayOfMonth(data.lengthOfMonth());return new PeriodoQuinzena(inicio,fim);}
    @Transactional(readOnly=true) public CalendarioPagamentoPorto obterPeriodo(Long id){return obter(id);}
    public String rotulo(CalendarioPagamentoPorto item){return new PeriodoQuinzena(item.getCompetenciaInicio(),item.getCompetenciaFim()).rotulo();}
    public record PeriodoQuinzena(LocalDate inicio,LocalDate fim){private static final DateTimeFormatter BR=DateTimeFormatter.ofPattern("dd/MM/yyyy");public String rotulo(){return inicio.format(BR)+" a "+fim.format(BR);}}
    private void validar(CalendarioRequest request,Long id){validarDataUnica(request.dataPagamento(),id);if(request.competenciaInicio().isAfter(request.competenciaFim()))throw new IllegalArgumentException("A data inicial da competência não pode ser posterior à final.");repositorio.findByCompetenciaInicioAndCompetenciaFim(request.competenciaInicio(),request.competenciaFim()).filter(x->!x.getId().equals(id)).ifPresent(x->{throw new IllegalArgumentException("Já existe um pagamento Porto configurado para este período.");});}
    private void validarDataUnica(LocalDate data,Long id){repositorio.findByDataPagamento(data).filter(x->!x.getId().equals(id)).ifPresent(x->{throw new IllegalArgumentException("Já existe um ciclo Porto nesta data.");});}
    private CalendarioPagamentoPorto obter(Long id){return repositorio.findById(id).orElseThrow(()->new RecursoNaoEncontradoException("Data do calendário Porto não encontrada."));}
    private CalendarioResponse resposta(CalendarioPagamentoPorto x){return new CalendarioResponse(x.getId(),x.getDataPagamento(),x.getCompetenciaInicio(),x.getCompetenciaFim(),x.getDescricao(),x.isAtivo(),x.getCriadoEm(),x.getAtualizadoEm());}
}
