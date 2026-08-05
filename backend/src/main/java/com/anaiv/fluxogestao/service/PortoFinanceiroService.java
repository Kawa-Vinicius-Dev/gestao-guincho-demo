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

    public PeriodoFinanceiro validarPeriodo(Collection<LocalDate> datas){
        if(datas.isEmpty())throw new IllegalArgumentException("A composição da OP não possui serviços válidos.");
        LinkedHashMap<Long,CalendarioPagamentoPorto> encontrados=new LinkedHashMap<>();
        for(LocalDate data:datas){CalendarioPagamentoPorto item=calendario.pagamentoDaCompetencia(data);encontrados.put(item.getId(),item);}
        if(encontrados.size()!=1)throw new IllegalArgumentException("Uma OP paga deve conter serviços de uma única quinzena configurada no calendário Porto.");
        CalendarioPagamentoPorto item=encontrados.values().iterator().next();
        return new PeriodoFinanceiro(item,calendario.periodo(datas.iterator().next()).rotulo());
    }

    public ResultadoSincronizacao sincronizar(OrdemServicoPorto os,OrdemPagamentoPorto op,Importacao importacao,CalendarioPagamentoPorto ciclo){
        if(os.getValorTotal()==null||os.getValorTotal().signum()<0||os.getDataAtendimento()==null)throw new IllegalArgumentException("A OS "+os.getNumero()+" não possui valor e data válidos para o lançamento financeiro.");
        Contratante contratante=contratantes.findFirstByNomeIgnoreCase(CONTRATANTE_PORTO).orElseGet(()->contratantes.save(new Contratante(CONTRATANTE_PORTO,null)));
        Categoria categoria=categorias.findFirstByNomeIgnoreCaseAndTipo(CATEGORIA_GUINCHO,TipoCategoria.RECEITA).orElseGet(()->categorias.save(new Categoria(CATEGORIA_GUINCHO,TipoCategoria.RECEITA)));
        Veiculo veiculo=localizarVeiculo(os);Motorista motorista=localizarMotorista(os);
        String descricao="Porto Seguro - OP "+op.getNumero()+" - OS "+os.getNumero();
        Optional<ContaReceber> contaExistente=contas.findByOrdemServicoPorto(os);
        ContaReceber conta=contaExistente.orElseGet(()->new ContaReceber(contratante,os.getNumero(),descricao,os.getValorTotal(),os.getDataAtendimento(),ciclo.getDataPagamento(),veiculo,null,OrigemLancamento.IMPORTADA,importacao));
        conta.sincronizarPorto(contratante,os.getNumero(),descricao,os.getValorTotal(),os.getDataAtendimento(),ciclo.getDataPagamento(),veiculo,motorista,importacao,os,op);
        ContaReceber contaSalva=contas.save(conta);
        Optional<Receita> receitaExistente=receitas.findByOrdemServicoPorto(os);
        Receita receita=receitaExistente.orElseGet(()->new Receita(contaSalva,contratante,categoria,descricao,os.getValorTotal(),os.getDataAtendimento(),ciclo.getDataPagamento(),StatusReceita.RECEBIDA,false,veiculo,null));
        receita.sincronizarPorto(contaSalva,contratante,categoria,descricao,os.getValorTotal(),os.getDataAtendimento(),ciclo.getDataPagamento(),veiculo,motorista,importacao,os,op);
        receitas.save(receita);os.marcarRecebida(ciclo.getDataPagamento());
        return new ResultadoSincronizacao(receitaExistente.isEmpty()?1:0,receitaExistente.isPresent()?1:0,os.getValorTotal());
    }

    private Veiculo localizarVeiculo(OrdemServicoPorto os){
        if(preenchido(os.getSiglaViatura())){Optional<Veiculo> resultado=veiculos.findFirstByIdentificacaoIgnoreCase(os.getSiglaViatura().trim());if(resultado.isPresent())return resultado.get();}
        return preenchido(os.getPlaca())?veiculos.findFirstByPlacaIgnoreCase(os.getPlaca().trim()).orElse(null):null;
    }
    private Motorista localizarMotorista(OrdemServicoPorto os){return preenchido(os.getSocorrista())?motoristas.findFirstByNomeIgnoreCase(os.getSocorrista().trim()).orElse(null):null;}
    private boolean preenchido(String valor){return valor!=null&&!valor.isBlank();}

    public record PeriodoFinanceiro(CalendarioPagamentoPorto calendario,String rotulo){}
    public record ResultadoSincronizacao(int receitasCriadas,int receitasAtualizadas,BigDecimal valor){}
}
