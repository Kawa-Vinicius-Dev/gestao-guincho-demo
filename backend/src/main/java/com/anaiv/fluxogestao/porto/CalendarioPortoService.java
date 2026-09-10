package com.anaiv.fluxogestao.porto;

import com.anaiv.fluxogestao.porto.PortoDtos.CalendarioRequest;
import com.anaiv.fluxogestao.porto.PortoDtos.CalendarioResponse;
import com.anaiv.fluxogestao.porto.CalendarioPagamentoPorto;
import com.anaiv.fluxogestao.exception.RecursoNaoEncontradoException;
import com.anaiv.fluxogestao.porto.CalendarioPagamentoPortoRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Optional;

@Service
public class CalendarioPortoService {
    private final CalendarioPagamentoPortoRepository repositorio;
    public CalendarioPortoService(CalendarioPagamentoPortoRepository repositorio){this.repositorio=repositorio;}
    @Transactional public List<CalendarioResponse> listar(){projetarCiclosFuturos();return repositorio.findAllByOrderByDataPagamento().stream().map(this::resposta).toList();}
    @Transactional public CalendarioResponse criar(CalendarioRequest request){validar(request,null);return resposta(repositorio.save(new CalendarioPagamentoPorto(request.dataPagamento(),request.competenciaInicio(),request.competenciaFim(),request.descricao(),request.ativo())));}
    @Transactional public CalendarioResponse atualizar(Long id,CalendarioRequest request){CalendarioPagamentoPorto item=obter(id);validar(request,id);item.atualizar(request.dataPagamento(),request.competenciaInicio(),request.competenciaFim(),request.descricao(),request.ativo());return resposta(item);}
    @Transactional public CalendarioResponse desativar(Long id){CalendarioPagamentoPorto item=obter(id);item.desativar();return resposta(item);}
    @Transactional public LocalDate proximaDataAtiva(LocalDate data){projetarCiclosFuturos();return repositorio.findFirstByAtivoTrueAndDataPagamentoAfterOrderByDataPagamento(data).orElseThrow(()->new IllegalArgumentException("Não há data ativa posterior no calendário Porto.")).getDataPagamento();}
    @Transactional(readOnly=true) public int ciclosUltrapassados(LocalDate prevista,LocalDate efetiva){if(prevista==null||efetiva==null||!efetiva.isAfter(prevista))return 0;return repositorio.findByAtivoTrueAndDataPagamentoAfterAndDataPagamentoLessThanEqualOrderByDataPagamento(prevista,efetiva).size();}
    @Transactional(readOnly=true) public Optional<LocalDate> previsaoDaCompetencia(LocalDate dataServico){
        PeriodoQuinzena periodo=periodo(dataServico);
        return repositorio.findFirstByAtivoTrueAndCompetenciaInicioLessThanEqualAndCompetenciaFimGreaterThanEqualOrderByDataPagamento(dataServico,dataServico)
            .filter(x->periodo.inicio().equals(x.getCompetenciaInicio())&&periodo.fim().equals(x.getCompetenciaFim()))
            .map(CalendarioPagamentoPorto::getDataPagamento);
    }
    private static final int PRIMEIRO_PAGAMENTO=16, SEGUNDO_PAGAMENTO=30, MESES_DE_FOLGA=6;
    private static final String[] MESES={"janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"};
    /**
     * A Porto entrega o calendario com meses de antecedencia, nunca o ano inteiro, e quando ele
     * acaba a importacao para. Os dez ciclos que a Porto informou seguem um padrao: pagamento nos
     * dias 16 e 30, recuando para a sexta quando cai em fim de semana; o do dia 16 paga a segunda
     * quinzena do mes anterior e o do dia 30 paga a primeira do proprio mes.
     *
     * O que se projeta daqui e a data, e data a Porto as vezes antecipa - foi o que fez em dezembro
     * de 2026. Por isso o ciclo nasce marcado como estimado: serve para o trabalho nao parar, e
     * perde a marca assim que alguem confirma o ciclo na tela.
     */
    private void projetarCiclosFuturos(){
        LocalDate limite=LocalDate.now().plusMonths(MESES_DE_FOLGA);
        for(YearMonth mes=YearMonth.from(LocalDate.now());!mes.atDay(1).isAfter(limite);mes=mes.plusMonths(1)){
            YearMonth anterior=mes.minusMonths(1);
            projetar(mes,PRIMEIRO_PAGAMENTO,anterior.atDay(16),anterior.atEndOfMonth(),"1º ciclo de "+rotulo(mes));
            projetar(mes,SEGUNDO_PAGAMENTO,mes.atDay(1),mes.atDay(15),"2º ciclo de "+rotulo(mes));
        }
    }
    private void projetar(YearMonth mes,int dia,LocalDate competenciaInicio,LocalDate competenciaFim,String descricao){
        // ja existe a competencia? entao a Porto ja informou esse ciclo, mesmo que noutra data
        if(repositorio.findByCompetenciaInicioAndCompetenciaFim(competenciaInicio,competenciaFim).isPresent())return;
        LocalDate pagamento=recuarParaDiaUtil(mes.atDay(Math.min(dia,mes.lengthOfMonth())));
        if(repositorio.findByDataPagamento(pagamento).isPresent())return;
        repositorio.save(CalendarioPagamentoPorto.projetado(pagamento,competenciaInicio,competenciaFim,descricao));
    }
    private LocalDate recuarParaDiaUtil(LocalDate data){
        while(data.getDayOfWeek()==DayOfWeek.SATURDAY||data.getDayOfWeek()==DayOfWeek.SUNDAY)data=data.minusDays(1);
        return data;
    }
    private String rotulo(YearMonth mes){return MESES[mes.getMonthValue()-1]+" de "+mes.getYear();}
    public PeriodoQuinzena periodo(LocalDate data){if(data==null)throw new IllegalArgumentException("A data de atendimento é obrigatória para localizar o calendário Porto.");LocalDate inicio=data.getDayOfMonth()<=15?data.withDayOfMonth(1):data.withDayOfMonth(16);LocalDate fim=data.getDayOfMonth()<=15?data.withDayOfMonth(15):data.withDayOfMonth(data.lengthOfMonth());return new PeriodoQuinzena(inicio,fim);}
    @Transactional(readOnly=true) public CalendarioPagamentoPorto obterPeriodo(Long id){return obter(id);}
    public String rotulo(CalendarioPagamentoPorto item){return new PeriodoQuinzena(item.getCompetenciaInicio(),item.getCompetenciaFim()).rotulo();}
    public record PeriodoQuinzena(LocalDate inicio,LocalDate fim){private static final DateTimeFormatter BR=DateTimeFormatter.ofPattern("dd/MM/yyyy");public String rotulo(){return inicio.format(BR)+" a "+fim.format(BR);}}
    private void validar(CalendarioRequest request,Long id){validarDataUnica(request.dataPagamento(),id);if(request.competenciaInicio().isAfter(request.competenciaFim()))throw new IllegalArgumentException("A data inicial da competência não pode ser posterior à final.");repositorio.findByCompetenciaInicioAndCompetenciaFim(request.competenciaInicio(),request.competenciaFim()).filter(x->!x.getId().equals(id)).ifPresent(x->{throw new IllegalArgumentException("Já existe um pagamento Porto configurado para este período.");});}
    private void validarDataUnica(LocalDate data,Long id){repositorio.findByDataPagamento(data).filter(x->!x.getId().equals(id)).ifPresent(x->{throw new IllegalArgumentException("Já existe um ciclo Porto nesta data.");});}
    private CalendarioPagamentoPorto obter(Long id){return repositorio.findById(id).orElseThrow(()->new RecursoNaoEncontradoException("Data do calendário Porto não encontrada."));}
    private CalendarioResponse resposta(CalendarioPagamentoPorto x){return new CalendarioResponse(x.getId(),x.getDataPagamento(),x.getCompetenciaInicio(),x.getCompetenciaFim(),x.getDescricao(),x.isAtivo(),x.isEstimado(),x.getCriadoEm(),x.getAtualizadoEm());}
}
