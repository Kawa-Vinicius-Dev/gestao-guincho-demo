package com.anaiv.fluxogestao.service;

import com.anaiv.fluxogestao.entity.*;
import com.anaiv.fluxogestao.repository.*;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;

import static com.anaiv.fluxogestao.entity.EnumsFinanceiros.*;

@Service
public class PortoFinanceiroService {
    private static final String CONTRATANTE_PORTO="Porto Seguro";
    private static final String CATEGORIA_GUINCHO="Serviços de guincho";
    private final ContaReceberRepository contas;private final ReceitaRepository receitas;
    private final ContratanteRepository contratantes;private final CategoriaRepository categorias;
    private final VeiculoRepository veiculos;private final MotoristaRepository motoristas;
    private final CalendarioPortoService calendario;

    public PortoFinanceiroService(ContaReceberRepository contas,ReceitaRepository receitas,ContratanteRepository contratantes,
        CategoriaRepository categorias,VeiculoRepository veiculos,MotoristaRepository motoristas,CalendarioPortoService calendario){
        this.contas=contas;this.receitas=receitas;this.contratantes=contratantes;this.categorias=categorias;
        this.veiculos=veiculos;this.motoristas=motoristas;this.calendario=calendario;
    }

    public PeriodoFinanceiro resolverPeriodo(OrdemPagamentoPorto op,Long calendarioPagamentoId){
        CalendarioPagamentoPorto item=op.getCalendarioPagamento();
        if(item==null&&calendarioPagamentoId!=null){item=calendario.obterPeriodo(calendarioPagamentoId);op.associarCalendario(item);}
        if(item==null)throw new IllegalArgumentException("Selecione o período financeiro da OP antes de confirmar o pagamento.");
        return new PeriodoFinanceiro(item,calendario.rotulo(item));
    }
    public PeriodoFinanceiro resolverPeriodoSelecionado(OrdemPagamentoPorto op,Long calendarioPagamentoId){
        if(calendarioPagamentoId==null)throw new IllegalArgumentException("Selecione o período financeiro da OP antes de confirmar o pagamento.");
        CalendarioPagamentoPorto item=calendario.obterPeriodo(calendarioPagamentoId);op.associarCalendario(item);
        return new PeriodoFinanceiro(item,calendario.rotulo(item));
    }

    public ResultadoSincronizacao sincronizar(OrdemServicoPorto os,OrdemPagamentoPorto op,Importacao importacao,CalendarioPagamentoPorto ciclo){
        return sincronizar(os,op,importacao,ciclo,ciclo.getDataPagamento());
    }
    public ResultadoSincronizacao sincronizar(OrdemServicoPorto os,OrdemPagamentoPorto op,Importacao importacao,CalendarioPagamentoPorto ciclo,LocalDate dataRecebimento){
        ResultadoLote resultado=sincronizarLote(List.of(os),op,importacao,ciclo,dataRecebimento);
        return new ResultadoSincronizacao(resultado.receitasCriadas(),resultado.receitasAtualizadas(),resultado.valorTotal());
    }
    public ResultadoLote sincronizarLote(List<OrdemServicoPorto> oss,OrdemPagamentoPorto op,Importacao importacao,CalendarioPagamentoPorto ciclo){
        return sincronizarLote(oss,op,importacao,ciclo,ciclo.getDataPagamento());
    }
    public ResultadoLote sincronizarLote(List<OrdemServicoPorto> oss,OrdemPagamentoPorto op,Importacao importacao,CalendarioPagamentoPorto ciclo,LocalDate dataRecebimento){
        if(oss.isEmpty())return new ResultadoLote(0,0,BigDecimal.ZERO);
        Contratante contratante=contratantes.findFirstByNomeIgnoreCase(CONTRATANTE_PORTO).orElseGet(()->contratantes.save(new Contratante(CONTRATANTE_PORTO,null)));
        Categoria categoria=categorias.findFirstByNomeIgnoreCaseAndTipo(CATEGORIA_GUINCHO,TipoCategoria.RECEITA).orElseGet(()->categorias.save(new Categoria(CATEGORIA_GUINCHO,TipoCategoria.RECEITA)));
        Map<Long,ContaReceber> contasPorOs=contas.findByOrdemServicoPortoIn(oss).stream().collect(java.util.stream.Collectors.toMap(x->x.getOrdemServicoPorto().getId(),x->x));
        Map<Long,Receita> receitasPorOs=receitas.findByOrdemServicoPortoIn(oss).stream().collect(java.util.stream.Collectors.toMap(x->x.getOrdemServicoPorto().getId(),x->x));
        int criadas=0,atualizadas=0;BigDecimal total=BigDecimal.ZERO;
        for(OrdemServicoPorto os:oss){
            ResultadoSincronizacao resultado=sincronizar(os,op,importacao,dataRecebimento,contratante,categoria,contasPorOs.get(os.getId()),receitasPorOs.get(os.getId()));
            criadas+=resultado.receitasCriadas();atualizadas+=resultado.receitasAtualizadas();total=total.add(resultado.valor());
        }
        return new ResultadoLote(criadas,atualizadas,total);
    }
    private ResultadoSincronizacao sincronizar(OrdemServicoPorto os,OrdemPagamentoPorto op,Importacao importacao,LocalDate dataRecebimento,Contratante contratante,Categoria categoria,ContaReceber contaExistente,Receita receitaExistente){
        if(os.getValorTotal()==null||os.getValorTotal().signum()<0||os.getDataAtendimento()==null)throw new IllegalArgumentException("A OS "+os.getNumero()+" não possui valor e data válidos para o lançamento financeiro.");
        Veiculo veiculo=localizarVeiculo(os);Motorista motorista=os.getMotorista();
        String descricao="Porto Seguro - OP "+op.getNumero()+" - OS "+os.getNumero();
        ContaReceber conta=contaExistente==null?new ContaReceber(contratante,os.getNumero(),descricao,os.getValorTotal(),os.getDataAtendimento(),dataRecebimento,veiculo,null,OrigemLancamento.IMPORTADA,importacao):contaExistente;
        conta.sincronizarPorto(contratante,os.getNumero(),descricao,os.getValorTotal(),os.getDataAtendimento(),dataRecebimento,veiculo,motorista,importacao,os,op);
        ContaReceber contaSalva=contas.save(conta);
        Receita receita=receitaExistente==null?new Receita(contaSalva,contratante,categoria,descricao,os.getValorTotal(),os.getDataAtendimento(),dataRecebimento,StatusReceita.RECEBIDA,false,veiculo,null):receitaExistente;
        receita.sincronizarPorto(contaSalva,contratante,categoria,descricao,os.getValorTotal(),os.getDataAtendimento(),dataRecebimento,veiculo,motorista,importacao,os,op);
        receitas.save(receita);os.marcarRecebida(dataRecebimento);
        return new ResultadoSincronizacao(receitaExistente==null?1:0,receitaExistente==null?0:1,os.getValorTotal());
    }

    /** A Porto nao informa a viatura no relatorio, entao o veiculo vem do cadastro do funcionario. */
    private Veiculo localizarVeiculo(OrdemServicoPorto os){
        if(preenchido(os.getSiglaViatura())){Optional<Veiculo> resultado=veiculos.findFirstByIdentificacaoIgnoreCase(os.getSiglaViatura().trim());if(resultado.isPresent())return resultado.get();}
        if(preenchido(os.getPlaca())){Optional<Veiculo> resultado=veiculos.findFirstByPlacaIgnoreCase(os.getPlaca().trim());if(resultado.isPresent())return resultado.get();}
        return os.getMotorista()==null?null:os.getMotorista().getVeiculo();
    }
    private boolean preenchido(String valor){return valor!=null&&!valor.isBlank();}

    public record PeriodoFinanceiro(CalendarioPagamentoPorto calendario,String rotulo){}
    public record ResultadoSincronizacao(int receitasCriadas,int receitasAtualizadas,BigDecimal valor){}
    public record ResultadoLote(int receitasCriadas,int receitasAtualizadas,BigDecimal valorTotal){}
}
