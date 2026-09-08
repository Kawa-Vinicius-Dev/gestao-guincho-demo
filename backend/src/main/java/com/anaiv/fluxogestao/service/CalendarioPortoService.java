package com.anaiv.fluxogestao.service;

import com.anaiv.fluxogestao.dto.PortoDtos.CalendarioRequest;
import com.anaiv.fluxogestao.dto.PortoDtos.ColagemCalendarioResponse;
import com.anaiv.fluxogestao.dto.PortoDtos.CalendarioResponse;
import com.anaiv.fluxogestao.entity.CalendarioPagamentoPorto;
import com.anaiv.fluxogestao.exception.RecursoNaoEncontradoException;
import com.anaiv.fluxogestao.repository.CalendarioPagamentoPortoRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class CalendarioPortoService {
    private final CalendarioPagamentoPortoRepository repositorio;
    public CalendarioPortoService(CalendarioPagamentoPortoRepository repositorio){this.repositorio=repositorio;}
    @Transactional(readOnly=true) public List<CalendarioResponse> listar(){return repositorio.findAllByOrderByDataPagamento().stream().map(this::resposta).toList();}
    private static final Pattern DATA_BR=Pattern.compile("\\b(\\d{2})/(\\d{2})/(\\d{4})\\b");

    /**
     * A Porto entrega so as datas de pagamento e a periodicidade. A competencia e derivada da posicao
     * do pagamento dentro do mes: o 1o pagamento cobre a 1a quinzena do mes anterior e o 2o cobre a 2a.
     * A regra vale mesmo quando a Porto antecipa o dia (14/08 e 14/12, por exemplo).
     */
    @Transactional public ColagemCalendarioResponse colar(String conteudo){
        TreeSet<LocalDate> datas=new TreeSet<>();Matcher m=DATA_BR.matcher(conteudo==null?"":conteudo);
        while(m.find())datas.add(LocalDate.of(Integer.parseInt(m.group(3)),Integer.parseInt(m.group(2)),Integer.parseInt(m.group(1))));
        if(datas.isEmpty())throw new IllegalArgumentException("Nenhuma data de pagamento reconhecida. Cole a lista do calendario Porto no formato dd/mm/aaaa.");
        int criados=0,ignorados=0;List<CalendarioResponse> itens=new ArrayList<>();
        for(LocalDate data:datas){
            Optional<CalendarioPagamentoPorto> existente=repositorio.findByDataPagamento(data);
            if(existente.isPresent()){ignorados++;itens.add(resposta(existente.get()));continue;}
            PeriodoQuinzena competencia=competenciaDoPagamento(data,datas);
            if(repositorio.findByCompetenciaInicioAndCompetenciaFim(competencia.inicio(),competencia.fim()).isPresent()){ignorados++;continue;}
            itens.add(resposta(repositorio.save(new CalendarioPagamentoPorto(data,competencia.inicio(),competencia.fim(),descricao(data,competencia),true))));
            criados++;
        }
        return new ColagemCalendarioResponse(criados,ignorados,itens);
    }
    /** Primeiro pagamento do mes: 1a quinzena do mes anterior. Segundo em diante: 2a quinzena. */
    private PeriodoQuinzena competenciaDoPagamento(LocalDate data,TreeSet<LocalDate> datas){
        boolean primeiroDoMes=datas.headSet(data).stream().noneMatch(x->x.getYear()==data.getYear()&&x.getMonthValue()==data.getMonthValue())
            &&repositorio.findAllByOrderByDataPagamento().stream().noneMatch(x->x.getDataPagamento().isBefore(data)&&x.getDataPagamento().getYear()==data.getYear()&&x.getDataPagamento().getMonthValue()==data.getMonthValue());
        LocalDate anterior=data.minusMonths(1);
        return primeiroDoMes?new PeriodoQuinzena(anterior.withDayOfMonth(1),anterior.withDayOfMonth(15))
            :new PeriodoQuinzena(anterior.withDayOfMonth(16),anterior.withDayOfMonth(anterior.lengthOfMonth()));
    }
    private String descricao(LocalDate data,PeriodoQuinzena competencia){
        return (competencia.inicio().getDayOfMonth()==1?"1º":"2º")+" ciclo de "+MES[data.getMonthValue()-1]+" de "+data.getYear();
    }
    private static final String[] MES={"janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"};

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
    @Transactional(readOnly=true) public Optional<LocalDate> previsaoDaCompetencia(LocalDate dataServico){
        PeriodoQuinzena periodo=periodo(dataServico);
        return repositorio.findFirstByAtivoTrueAndCompetenciaInicioLessThanEqualAndCompetenciaFimGreaterThanEqualOrderByDataPagamento(dataServico,dataServico)
            .filter(x->periodo.inicio().equals(x.getCompetenciaInicio())&&periodo.fim().equals(x.getCompetenciaFim()))
            .map(CalendarioPagamentoPorto::getDataPagamento);
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
