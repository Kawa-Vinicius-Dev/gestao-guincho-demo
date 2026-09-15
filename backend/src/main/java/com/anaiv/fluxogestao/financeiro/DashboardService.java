package com.anaiv.fluxogestao.financeiro;

import com.anaiv.fluxogestao.cadastro.*;
import com.anaiv.fluxogestao.financeiro.*;
import com.anaiv.fluxogestao.financeiro.FinanceiroDtos.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import static com.anaiv.fluxogestao.financeiro.EnumsFinanceiros.*;

@Service
public class DashboardService {
    private static final BigDecimal ZERO=BigDecimal.ZERO;
    private final ContaReceberRepository contasRepository;private final ReceitaRepository receitasRepository;private final DespesaRepository despesasRepository;private final QuilometragemRepository quilometragensRepository;
    private final ImportacaoRepository importacoes; private final CadastroService cadastros;
    private final com.anaiv.fluxogestao.porto.OrdemServicoPortoRepository oss;
    private final com.anaiv.fluxogestao.comissao.PagamentoComissaoRepository pagamentosComissao;
    /** A comissao e 20% do servico; mesma regra da tela de comissao (ComissaoService.PERCENTUAL). */
    private static final BigDecimal PERCENTUAL_COMISSAO=new BigDecimal("0.20");
    public DashboardService(ContaReceberRepository contas,ReceitaRepository receitas,DespesaRepository despesas,QuilometragemRepository quilometragens,ImportacaoRepository i,CadastroService c,com.anaiv.fluxogestao.porto.OrdemServicoPortoRepository oss,com.anaiv.fluxogestao.comissao.PagamentoComissaoRepository pagamentosComissao){
        contasRepository=contas;receitasRepository=receitas;despesasRepository=despesas;quilometragensRepository=quilometragens;importacoes=i;cadastros=c;this.oss=oss;this.pagamentosComissao=pagamentosComissao;
    }
    @Transactional
    public DashboardResponse dashboard(LocalDate inicio,LocalDate fim,Long veiculoId,Long motoristaId,Long categoriaId,String status,Long contratanteId){
        var contas=contasRepository.findByDataCompetenciaBetweenOrderByVencimento(inicio,fim).stream().peek(c->c.atualizarAtraso(LocalDate.now()))
            .filter(c->veiculoId==null||(c.getVeiculo()!=null&&c.getVeiculo().getId().equals(veiculoId)))
            .filter(c->contratanteId==null||c.getContratante().getId().equals(contratanteId))
            .filter(c->status==null||c.getStatus().name().equals(status)).toList();
        var receitas=receitasRepository.findParaDashboardEntre(inicio,fim).stream()
            .filter(r->veiculoId==null||(r.getVeiculo()!=null&&r.getVeiculo().getId().equals(veiculoId)))
            .filter(r->motoristaId==null||(r.getMotorista()!=null&&r.getMotorista().getId().equals(motoristaId)))
            .filter(r->categoriaId==null||(r.getCategoria()!=null&&r.getCategoria().getId().equals(categoriaId)))
            .filter(r->contratanteId==null||(r.getContratante()!=null&&r.getContratante().getId().equals(contratanteId)))
            .filter(r->status==null||r.getStatus().name().equals(status)).toList();
        var despesas=despesasRepository.findParaDashboardEntre(inicio,fim).stream().peek(d->d.atualizarAtraso(LocalDate.now()))
            .filter(d->veiculoId==null||(d.getVeiculo()!=null&&d.getVeiculo().getId().equals(veiculoId)))
            .filter(d->motoristaId==null||(d.getMotorista()!=null&&d.getMotorista().getId().equals(motoristaId)))
            .filter(d->categoriaId==null||d.getCategoria().getId().equals(categoriaId))
            .filter(d->status==null||d.getStatus().name().equals(status)).toList();
        var kms=quilometragensRepository.findByDataBetween(inicio,fim).stream()
            .filter(q->veiculoId==null||q.getVeiculo().getId().equals(veiculoId))
            .filter(q->motoristaId==null||(q.getMotorista()!=null&&q.getMotorista().getId().equals(motoristaId))).toList();

        BigDecimal recebida=soma(receitas.stream().filter(r->r.getStatus()==StatusReceita.RECEBIDA).map(Receita::getValor).toList());
        BigDecimal previstaContas=soma(contas.stream().filter(c->c.getStatus()==StatusContaReceber.PENDENTE||c.getStatus()==StatusContaReceber.ATRASADO).map(ContaReceber::getValorPrevisto).toList());
        BigDecimal previstaManual=soma(receitas.stream().filter(r->r.getStatus()==StatusReceita.PREVISTA).map(Receita::getValor).toList());
        BigDecimal prevista=previstaContas.add(previstaManual);
        BigDecimal atrasada=soma(contas.stream().filter(c->c.getStatus()==StatusContaReceber.ATRASADO).map(ContaReceber::getValorPrevisto).toList());
        var despesasPagasNoPeriodo=despesas.stream().filter(Despesa::isAprovada)
            .filter(d->d.getStatus()==StatusDespesa.PAGO).toList();
        BigDecimal pagas=soma(despesasPagasNoPeriodo.stream().map(Despesa::getValor).toList());
        BigDecimal despPrev=soma(despesas.stream().filter(Despesa::isAprovada).filter(d->d.getStatus()==StatusDespesa.PENDENTE||d.getStatus()==StatusDespesa.ATRASADO).map(Despesa::getValor).toList());
        BigDecimal realizado=recebida.subtract(pagas), projetado=recebida.add(prevista).subtract(pagas).subtract(despPrev);
        BigDecimal kmTotal=soma(kms.stream().map(Quilometragem::getQuilometragemTotal).toList());
        BigDecimal kmRem=soma(kms.stream().map(Quilometragem::getQuilometragemRemunerada).toList());
        BigDecimal kmMorto=soma(kms.stream().map(Quilometragem::getKmMorto).toList());
        BigDecimal custoMorto=soma(kms.stream().map(Quilometragem::getCustoKmMorto).toList());
        List<ResultadoVeiculo> resultados=cadastros.veiculos().stream().map(v->{
            BigDecimal rv=soma(receitas.stream().filter(r->r.getVeiculo()!=null&&r.getVeiculo().getId().equals(v.id())&&r.getStatus()==StatusReceita.RECEBIDA).map(Receita::getValor).toList());
            BigDecimal dv=soma(despesas.stream().filter(Despesa::isAprovada).filter(d->d.getVeiculo()!=null&&d.getVeiculo().getId().equals(v.id())&&d.getStatus()==StatusDespesa.PAGO)
                .filter(d->d.getNatureza()!=EnumsFinanceiros.NaturezaDespesa.ALIMENTACAO_FUNCIONARIO).map(Despesa::getValor).toList());
            BigDecimal kmv=soma(kms.stream().filter(q->q.getVeiculo().getId().equals(v.id())).map(Quilometragem::getKmMorto).toList());
            BigDecimal cv=soma(kms.stream().filter(q->q.getVeiculo().getId().equals(v.id())).map(Quilometragem::getCustoKmMorto).toList());
            return new ResultadoVeiculo(v.id(),v.identificacao(),rv,dv,rv.subtract(dv),kmv,cv);
        }).filter(r->r.receitas().signum()!=0||r.despesas().signum()!=0||r.kmMorto().signum()!=0).toList();
        long importados=importacoes.somarTotalRegistrosPorStatus(StatusImportacao.CONFIRMADA);

        // Producao e comissao aparecem lado a lado porque uma e 20% da outra: ver o servico sem a
        // comissao esconde metade do que aquele dia custou.
        // Nao entram no saldo: a receita do servico ja esta em receitaRecebida (o pipeline Porto
        // cria a Receita) e a comissao ja vira Despesa quando e paga - somar de novo contaria duas vezes.
        var servicosDoPeriodo=oss.findPorAtendimentoEntre(inicio,fim);
        BigDecimal producaoPaga=soma(servicosDoPeriodo.stream()
            .filter(os->os.getStatusFinanceiro()==StatusFinanceiroPorto.RECEBIDO)
            .map(com.anaiv.fluxogestao.porto.OrdemServicoPorto::getValorTotal).toList());
        BigDecimal comissaoSobreProducao=producaoPaga.multiply(PERCENTUAL_COMISSAO).setScale(2,java.math.RoundingMode.HALF_UP);
        // Servico cadastrado no dia ainda nao foi pago: a Porto so paga depois de fechar a OP.
        // Fica visivel como pendente em vez de sumir do dia em que aconteceu.
        var pendentes=servicosDoPeriodo.stream()
            .filter(os->os.getStatusFinanceiro()!=StatusFinanceiroPorto.RECEBIDO)
            .filter(os->os.getStatusOperacional()!=StatusOperacionalPorto.CANCELADO).toList();
        BigDecimal producaoPendente=soma(pendentes.stream()
            .map(com.anaiv.fluxogestao.porto.OrdemServicoPorto::getValorTotal).toList());

        // Comissao que a equipe ainda tem a receber. Nao da para subtrair "comissao paga no periodo"
        // da "comissao produzida no periodo": a producao e contada pela data do atendimento e o
        // repasse pela data do pagamento, entao uma comissao de agosto paga em setembro nao bate em
        // recorte nenhum. Aqui a pergunta e feita servico a servico: o ciclo que pagou esta OS ja
        // teve repasse para este socorrista? Se teve, ela nao e mais divida.
        BigDecimal comissaoAPagar=soma(servicosDoPeriodo.stream()
            .filter(os->os.getStatusFinanceiro()==StatusFinanceiroPorto.RECEBIDO)
            .filter(os->os.getMotorista()!=null&&os.getOrdemPagamento()!=null)
            .filter(os->os.getOrdemPagamento().getCalendarioPagamento()!=null)
            .filter(os->pagamentosComissao.findByMotoristaAndCalendarioPagamento(
                os.getMotorista(),os.getOrdemPagamento().getCalendarioPagamento()).isEmpty())
            .map(com.anaiv.fluxogestao.porto.OrdemServicoPorto::getValorTotal).toList())
            .multiply(PERCENTUAL_COMISSAO).setScale(2,java.math.RoundingMode.HALF_UP);

        // Gasto por socorrista: o que cada um custou no periodo - a comissao dele mais as despesas
        // que sao DELE. Despesa com viatura e custo da viatura, mesmo lancada pelo socorrista:
        // combustivel e manutencao do L168 abastecido pelo Natanael sao gasto do L168, nao do
        // Natanael. Antes contava nos dois lugares - o mesmo abastecimento aparecia no custo do
        // veiculo e no custo da pessoa. Fica com a pessoa so o que nao tem viatura, e a
        // alimentacao, que e da pessoa mesmo com viatura anotada. Assim cada despesa cai em um
        // lugar so. Producao ao lado, pela razao de sempre: comissao sem o servico nao diz nada.
        Map<Long,List<com.anaiv.fluxogestao.porto.OrdemServicoPorto>> porSocorrista=servicosDoPeriodo.stream()
            .filter(os->os.getMotorista()!=null)
            .filter(os->os.getStatusFinanceiro()==StatusFinanceiroPorto.RECEBIDO)
            .collect(java.util.stream.Collectors.groupingBy(os->os.getMotorista().getId()));
        List<ResultadoSocorrista> porPessoa=cadastros.motoristas().stream().map(m->{
            var servicos=porSocorrista.getOrDefault(m.id(),List.of());
            BigDecimal producao=soma(servicos.stream().map(com.anaiv.fluxogestao.porto.OrdemServicoPorto::getValorTotal).toList());
            BigDecimal comissao=producao.multiply(PERCENTUAL_COMISSAO).setScale(2,java.math.RoundingMode.HALF_UP);
            BigDecimal gastos=soma(despesas.stream().filter(Despesa::isAprovada)
                .filter(d->d.getMotorista()!=null&&d.getMotorista().getId().equals(m.id()))
                .filter(d->d.getVeiculo()==null||d.getNatureza()==EnumsFinanceiros.NaturezaDespesa.ALIMENTACAO_FUNCIONARIO)
                .filter(d->d.getProtocolo()==null||!d.getProtocolo().startsWith("COMISSAO-"))
                .map(Despesa::getValor).toList());
            return new ResultadoSocorrista(m.id(),m.nome(),servicos.size(),producao,comissao,gastos,comissao.add(gastos));
        }).filter(r->r.servicos()>0||r.despesas().signum()!=0).toList();

        // Para onde o dinheiro foi. Mesma base do numero grande de "despesas pagas"
        // logo acima - aprovada e paga -, so que quebrada por categoria, para a
        // pergunta "o que mais pesou no mes" ter resposta sem abrir outra tela.
        // Agrupa a lista que ja esta em memoria: nao ha consulta nova.
        List<GastoPorCategoria> porCategoria=despesasPagasNoPeriodo.stream()
            .filter(d->d.getCategoria()!=null)
            .collect(java.util.stream.Collectors.groupingBy(Despesa::getCategoria,
                java.util.stream.Collectors.reducing(ZERO,Despesa::getValor,BigDecimal::add)))
            .entrySet().stream()
            .map(e->new GastoPorCategoria(e.getKey().getId(),e.getKey().getNome(),e.getValue(),
                participacao(e.getValue(),pagas)))
            .sorted(java.util.Comparator.comparing(GastoPorCategoria::valor).reversed())
            .toList();

        // Linha acumulada do periodo. Usa a colecao ja carregada e a mesma base de "pagas":
        // aprovada + PAGO. A data acompanha a consulta do dashboard: pagamento, ou lancamento
        // quando o pagamento nao foi informado. Dias sem movimento ficam implicitos.
        Map<LocalDate,BigDecimal> valorPorDia=despesasPagasNoPeriodo.stream()
            .collect(java.util.stream.Collectors.groupingBy(
                d->d.getDataPagamento()!=null?d.getDataPagamento():d.getData(),
                TreeMap::new,
                java.util.stream.Collectors.reducing(ZERO,Despesa::getValor,BigDecimal::add)));
        List<DespesaAcumuladaDia> acumuladasPorDia=new ArrayList<>();
        BigDecimal acumulado=ZERO;
        for(var gasto:valorPorDia.entrySet()){
            acumulado=acumulado.add(gasto.getValue());
            acumuladasPorDia.add(new DespesaAcumuladaDia(gasto.getKey(),gasto.getValue(),acumulado));
        }

        // Servico prestado no periodo que a Porto paga fora dele. A receita existe,
        // so nao nesta janela — e sem dizer onde ela esta a tela parece quebrada
        // para quem acabou de importar o relatorio e ve zero.
        Map<LocalDate,List<com.anaiv.fluxogestao.porto.OrdemServicoPorto>> pagosForaDaJanela=
            servicosDoPeriodo.stream()
                .filter(os->os.getStatusFinanceiro()==StatusFinanceiroPorto.RECEBIDO)
                .filter(os->os.getDataEfetivaPagamento()!=null)
                .filter(os->!entre(os.getDataEfetivaPagamento(),inicio,fim))
                .collect(java.util.stream.Collectors.groupingBy(
                    com.anaiv.fluxogestao.porto.OrdemServicoPorto::getDataEfetivaPagamento,
                    TreeMap::new,java.util.stream.Collectors.toList()));
        List<RecebimentoForaDoPeriodo> foraDoPeriodo=pagosForaDaJanela.entrySet().stream()
            .map(dia->new RecebimentoForaDoPeriodo(dia.getKey(),
                soma(dia.getValue().stream().map(com.anaiv.fluxogestao.porto.OrdemServicoPorto::getValorTotal).toList()),
                dia.getValue().size()))
            .toList();

        return new DashboardResponse(recebida,prevista,atrasada,pagas,despPrev,realizado,projetado,
            importados,kmTotal,kmRem,kmMorto,custoMorto,resultados,
            producaoPaga,comissaoSobreProducao,producaoPendente,pendentes.size(),servicosDoPeriodo.size(),
            comissaoAPagar,porCategoria,porPessoa,acumuladasPorDia,foraDoPeriodo);
    }
    private boolean entre(LocalDate data,LocalDate inicio,LocalDate fim){return data!=null&&!data.isBefore(inicio)&&!data.isAfter(fim);}
    /** Quanto a categoria representa do total pago, em pontos percentuais. Total zero da zero. */
    private BigDecimal participacao(BigDecimal valor,BigDecimal total){
        if(total==null||total.signum()==0)return ZERO;
        return valor.multiply(new BigDecimal("100")).divide(total,1,java.math.RoundingMode.HALF_UP);
    }
    private BigDecimal soma(List<BigDecimal> valores){return valores.stream().filter(Objects::nonNull).reduce(ZERO,BigDecimal::add);}
}
