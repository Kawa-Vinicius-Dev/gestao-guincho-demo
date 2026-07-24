package com.anaiv.fluxogestao.service;

import com.anaiv.fluxogestao.dto.FinanceiroDtos.*;
import com.anaiv.fluxogestao.entity.*;
import com.anaiv.fluxogestao.repository.ImportacaoRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import static com.anaiv.fluxogestao.entity.EnumsFinanceiros.*;

@Service
public class DashboardService {
    private static final BigDecimal ZERO=BigDecimal.ZERO;
    private final FinanceiroService financeiro; private final QuilometragemService quilometragens;
    private final ImportacaoRepository importacoes; private final CadastroService cadastros;
    public DashboardService(FinanceiroService f,QuilometragemService q,ImportacaoRepository i,CadastroService c){
        financeiro=f;quilometragens=q;importacoes=i;cadastros=c;
    }
    @Transactional
    public DashboardResponse dashboard(LocalDate inicio,LocalDate fim,Long veiculoId,Long motoristaId,Long categoriaId,String status,Long contratanteId){
        var contas=financeiro.contasEntidades().stream().peek(c->c.atualizarAtraso(LocalDate.now()))
            .filter(c->entre(c.getDataCompetencia(),inicio,fim))
            .filter(c->veiculoId==null||(c.getVeiculo()!=null&&c.getVeiculo().getId().equals(veiculoId)))
            .filter(c->contratanteId==null||c.getContratante().getId().equals(contratanteId))
            .filter(c->status==null||c.getStatus().name().equals(status)).toList();
        var receitas=financeiro.receitasEntidades().stream()
            .filter(r->entre(r.getDataRecebimento()!=null?r.getDataRecebimento():r.getDataCompetencia(),inicio,fim))
            .filter(r->veiculoId==null||(r.getVeiculo()!=null&&r.getVeiculo().getId().equals(veiculoId)))
            .filter(r->categoriaId==null||(r.getCategoria()!=null&&r.getCategoria().getId().equals(categoriaId)))
            .filter(r->contratanteId==null||(r.getContratante()!=null&&r.getContratante().getId().equals(contratanteId)))
            .filter(r->status==null||r.getStatus().name().equals(status)).toList();
        var despesas=financeiro.despesasEntidades().stream().peek(d->d.atualizarAtraso(LocalDate.now()))
            .filter(d->entre(d.getDataPagamento()!=null?d.getDataPagamento():d.getData(),inicio,fim))
            .filter(d->veiculoId==null||(d.getVeiculo()!=null&&d.getVeiculo().getId().equals(veiculoId)))
            .filter(d->motoristaId==null||(d.getMotorista()!=null&&d.getMotorista().getId().equals(motoristaId)))
            .filter(d->categoriaId==null||d.getCategoria().getId().equals(categoriaId))
            .filter(d->status==null||d.getStatus().name().equals(status)).toList();
        var kms=quilometragens.entidades().stream().filter(q->entre(q.getData(),inicio,fim))
            .filter(q->veiculoId==null||q.getVeiculo().getId().equals(veiculoId))
            .filter(q->motoristaId==null||(q.getMotorista()!=null&&q.getMotorista().getId().equals(motoristaId))).toList();

        BigDecimal recebida=soma(receitas.stream().filter(r->r.getStatus()==StatusReceita.RECEBIDA).map(Receita::getValor).toList());
        BigDecimal previstaContas=soma(contas.stream().filter(c->c.getStatus()==StatusContaReceber.PENDENTE||c.getStatus()==StatusContaReceber.ATRASADO).map(ContaReceber::getValorPrevisto).toList());
        BigDecimal previstaManual=soma(receitas.stream().filter(r->r.getStatus()==StatusReceita.PREVISTA).map(Receita::getValor).toList());
        BigDecimal prevista=previstaContas.add(previstaManual);
        BigDecimal atrasada=soma(contas.stream().filter(c->c.getStatus()==StatusContaReceber.ATRASADO).map(ContaReceber::getValorPrevisto).toList());
        BigDecimal pagas=soma(despesas.stream().filter(Despesa::isAprovada).filter(d->d.getStatus()==StatusDespesa.PAGO).map(Despesa::getValor).toList());
        BigDecimal despPrev=soma(despesas.stream().filter(Despesa::isAprovada).filter(d->d.getStatus()==StatusDespesa.PENDENTE||d.getStatus()==StatusDespesa.ATRASADO).map(Despesa::getValor).toList());
        BigDecimal realizado=recebida.subtract(pagas), projetado=recebida.add(prevista).subtract(pagas).subtract(despPrev);
        BigDecimal kmTotal=soma(kms.stream().map(Quilometragem::getQuilometragemTotal).toList());
        BigDecimal kmRem=soma(kms.stream().map(Quilometragem::getQuilometragemRemunerada).toList());
        BigDecimal kmMorto=soma(kms.stream().map(Quilometragem::getKmMorto).toList());
        BigDecimal custoMorto=soma(kms.stream().map(Quilometragem::getCustoKmMorto).toList());
        List<ResultadoVeiculo> resultados=cadastros.veiculos().stream().map(v->{
            BigDecimal rv=soma(receitas.stream().filter(r->r.getVeiculo()!=null&&r.getVeiculo().getId().equals(v.id())&&r.getStatus()==StatusReceita.RECEBIDA).map(Receita::getValor).toList());
            BigDecimal dv=soma(despesas.stream().filter(Despesa::isAprovada).filter(d->d.getVeiculo()!=null&&d.getVeiculo().getId().equals(v.id())&&d.getStatus()==StatusDespesa.PAGO).map(Despesa::getValor).toList());
            BigDecimal kmv=soma(kms.stream().filter(q->q.getVeiculo().getId().equals(v.id())).map(Quilometragem::getKmMorto).toList());
            BigDecimal cv=soma(kms.stream().filter(q->q.getVeiculo().getId().equals(v.id())).map(Quilometragem::getCustoKmMorto).toList());
            return new ResultadoVeiculo(v.id(),v.identificacao(),rv,dv,rv.subtract(dv),kmv,cv);
        }).filter(r->r.receitas().signum()!=0||r.despesas().signum()!=0||r.kmMorto().signum()!=0).toList();
        long importados=importacoes.findAll().stream().filter(i->i.getStatus()==StatusImportacao.CONFIRMADA).mapToLong(Importacao::getTotalRegistros).sum();
        return new DashboardResponse(recebida,prevista,prevista,atrasada,pagas,despPrev,realizado,projetado,projetado,
            importados,kmTotal,kmRem,kmMorto,custoMorto,resultados);
    }
    private boolean entre(LocalDate data,LocalDate inicio,LocalDate fim){return data!=null&&!data.isBefore(inicio)&&!data.isAfter(fim);}
    private BigDecimal soma(List<BigDecimal> valores){return valores.stream().filter(Objects::nonNull).reduce(ZERO,BigDecimal::add);}
}
