package com.anaiv.fluxogestao.service;

import com.anaiv.fluxogestao.dto.PortoDtos.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.*;
import java.time.temporal.TemporalAdjusters;
import java.util.*;

@Service
public class PortoDashboardService {
    private final PortoService porto;
    public PortoDashboardService(PortoService porto){this.porto=porto;}

    @Transactional(readOnly=true) public Map<String,Object> dashboard(PortoDashboardFiltros filtro){
        Intervalo intervalo=intervalo(filtro);LocalDate inicio=intervalo.inicio(),fim=intervalo.fim();
        String numeroOp=filtro.numeroOp()==null||filtro.numeroOp().isBlank()?filtro.numero():filtro.numeroOp();
        PortoFiltros opFiltro=new PortoFiltros(inicio,fim,numeroOp,null,filtro.statusConciliacao(),null,null,null,null);
        PortoOsFiltros osFiltro=new PortoOsFiltros(inicio,fim,filtro.numeroOs(),numeroOp,filtro.especialidade(),filtro.socorrista(),filtro.qra(),filtro.viatura(),filtro.statusOperacional(),filtro.statusFinanceiro(),filtro.statusConciliacao());
        Map<String,Object> resposta=new LinkedHashMap<>(porto.dashboard(opFiltro,osFiltro));
        PortoFiltros recebimentoFiltro=new PortoFiltros(null,null,numeroOp,null,filtro.statusConciliacao(),null,null,null,null);
        List<OrdemPagamentoResponse> recebidas=porto.listarOps(recebimentoFiltro).stream().filter(x->x.dataRecebimento()!=null&&dentro(x.dataRecebimento(),inicio,fim)).toList();
        BigDecimal valorRecebido=recebidas.stream().map(OrdemPagamentoResponse::valorRecebido).filter(Objects::nonNull).reduce(BigDecimal.ZERO,BigDecimal::add);
        resposta.put("quantidadeRecebidas",recebidas.size());resposta.put("valorRecebido",valorRecebido);resposta.put("valorEfetivamenteRecebido",valorRecebido);
        resposta.put("periodoInicio",inicio);resposta.put("periodoFim",fim);resposta.put("periodo",normalizar(filtro.periodo(),"PERSONALIZADO"));resposta.put("visao",normalizar(filtro.visao(),"PRODUCAO"));
        return resposta;
    }

    private Intervalo intervalo(PortoDashboardFiltros f){String periodo=normalizar(f.periodo(),null);if(periodo==null)return new Intervalo(f.dataInicio(),f.dataFim());LocalDate ref=f.referencia()==null?LocalDate.now():f.referencia();return switch(periodo){
        case "DIARIO"->new Intervalo(ref,ref);
        case "SEMANAL"->new Intervalo(ref.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)),ref.with(TemporalAdjusters.nextOrSame(DayOfWeek.SUNDAY)));
        case "QUINZENAL"->ref.getDayOfMonth()<=15?new Intervalo(ref.withDayOfMonth(1),ref.withDayOfMonth(15)):new Intervalo(ref.withDayOfMonth(16),ref.with(TemporalAdjusters.lastDayOfMonth()));
        case "MENSAL"->new Intervalo(ref.withDayOfMonth(1),ref.with(TemporalAdjusters.lastDayOfMonth()));
        case "PERSONALIZADO"->new Intervalo(f.dataInicio(),f.dataFim());
        default->throw new IllegalArgumentException("Período do dashboard Porto inválido.");};}
    private boolean dentro(LocalDate data,LocalDate inicio,LocalDate fim){return (inicio==null||!data.isBefore(inicio))&&(fim==null||!data.isAfter(fim));}
    private String normalizar(String valor,String padrao){return valor==null||valor.isBlank()?padrao:valor.trim().toUpperCase(Locale.ROOT);}
    private record Intervalo(LocalDate inicio,LocalDate fim){}
}
