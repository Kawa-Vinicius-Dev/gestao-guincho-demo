package com.anaiv.fluxogestao.service;

import com.anaiv.fluxogestao.dto.ComissaoDtos.*;
import com.anaiv.fluxogestao.entity.*;
import com.anaiv.fluxogestao.exception.RecursoNaoEncontradoException;
import com.anaiv.fluxogestao.repository.*;
import com.anaiv.fluxogestao.security.UsuarioPrincipal;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;

import static com.anaiv.fluxogestao.entity.EnumsFinanceiros.*;

@Service
public class ComissaoService {
    private static final BigDecimal PERCENTUAL=new BigDecimal("0.20");
    private final MotoristaRepository motoristas;private final UsuarioRepository usuarios;private final OrdemServicoPortoRepository oss;
    private final DespesaRepository despesas;private final CategoriaRepository categorias;private final CalendarioPortoService calendarios;
    public ComissaoService(MotoristaRepository motoristas,UsuarioRepository usuarios,OrdemServicoPortoRepository oss,
        DespesaRepository despesas,CategoriaRepository categorias,CalendarioPortoService calendarios){this.motoristas=motoristas;this.usuarios=usuarios;this.oss=oss;this.despesas=despesas;this.categorias=categorias;this.calendarios=calendarios;}

    @Transactional public AlimentacaoResponse registrarAlimentacao(AlimentacaoRequest request,UsuarioPrincipal principal){
        Motorista motorista=motoristaDoUsuario(principal);Usuario usuario=usuarios.findById(principal.id()).orElseThrow(()->new RecursoNaoEncontradoException("Usuário autenticado não encontrado."));
        Categoria categoria=categorias.findFirstByNomeIgnoreCaseAndTipo("Alimentação em serviço",TipoCategoria.DESPESA)
            .orElseGet(()->categorias.save(new Categoria("Alimentação em serviço",TipoCategoria.DESPESA)));
        Despesa despesa=new Despesa("Alimentação diária",categoria,request.valor(),request.data(),request.data(),null,null,null,motorista,
            null,null,request.observacoes(),StatusDespesa.PENDENTE,usuario);despesa.marcarComoAlimentacao();return alimentacao(despesas.save(despesa));
    }

    @Transactional(readOnly=true) public ComissaoResponse minha(Long calendarioPagamentoId,UsuarioPrincipal principal){return calcular(calendarioPagamentoId,motoristaDoUsuario(principal));}
    @Transactional(readOnly=true) public ComissaoResponse detalhe(Long calendarioPagamentoId,Long motoristaId){return calcular(calendarioPagamentoId,obterMotorista(motoristaId));}
    @Transactional(readOnly=true) public List<ResumoComissaoResponse> resumo(Long calendarioPagamentoId,Long motoristaId){
        return motoristas.findAll().stream().filter(Motorista::isAtivo).filter(m->motoristaId==null||m.getId().equals(motoristaId))
            .map(m->calcular(calendarioPagamentoId,m)).map(c->new ResumoComissaoResponse(c.motoristaId(),c.funcionario(),c.quantidadeServicosPagos(),c.producaoPaga(),c.comissaoBruta(),c.alimentacaoAprovada(),c.liquido())).toList();
    }
    @Transactional(readOnly=true) public String csv(Long calendarioPagamentoId){
        StringBuilder csv=new StringBuilder("\uFEFFFuncionário;Período;Serviços pagos;Produção paga;Comissão 20%;Alimentação;Líquido\r\n");
        for(ResumoComissaoResponse r:resumo(calendarioPagamentoId,null)){csv.append(campo(r.funcionario())).append(';').append(campo(calendarios.rotulo(calendarios.obterPeriodo(calendarioPagamentoId)))).append(';')
            .append(r.quantidadeServicosPagos()).append(';').append(r.producaoPaga()).append(';').append(r.comissaoBruta()).append(';').append(r.alimentacaoAprovada()).append(';').append(r.liquido()).append("\r\n");}
        return csv.toString();
    }
    private ComissaoResponse calcular(Long calendarioPagamentoId,Motorista motorista){
        CalendarioPagamentoPorto periodo=calendarios.obterPeriodo(calendarioPagamentoId);
        List<OrdemServicoPorto> servicos=oss.findByMotorista(motorista).stream().filter(os->os.getOrdemPagamento()!=null)
            .filter(os->os.getOrdemPagamento().getCalendarioPagamento()!=null&&os.getOrdemPagamento().getCalendarioPagamento().getId().equals(periodo.getId()))
            .filter(os->os.getOrdemPagamento().getSituacaoFinanceira()==SituacaoFinanceiraOpPorto.RECEBIDO&&os.getStatusFinanceiro()==StatusFinanceiroPorto.RECEBIDO)
            .collect(java.util.stream.Collectors.toMap(OrdemServicoPorto::getId,x->x,(a,b)->a,LinkedHashMap::new)).values().stream().toList();
        BigDecimal producao=soma(servicos.stream().map(OrdemServicoPorto::getValorTotal).toList());BigDecimal bruta=producao.multiply(PERCENTUAL).setScale(2,RoundingMode.HALF_UP);
        List<Despesa> alimentacoes=despesas.findByMotoristaAndNaturezaAndDataBetweenOrderByDataDesc(motorista,NaturezaDespesa.ALIMENTACAO_FUNCIONARIO,periodo.getCompetenciaInicio(),periodo.getCompetenciaFim());
        BigDecimal aprovada=soma(alimentacoes.stream().filter(Despesa::isAprovada).filter(d->d.getStatus()!=StatusDespesa.REJEITADO).map(Despesa::getValor).toList());
        BigDecimal pendente=soma(alimentacoes.stream().filter(d->!d.isAprovada()).filter(d->d.getStatus()!=StatusDespesa.REJEITADO).map(Despesa::getValor).toList());
        List<ServicoComissaoResponse> detalhados=servicos.stream().map(os->new ServicoComissaoResponse(os.getId(),os.getNumero(),os.getEspecialidade(),os.getDataAtendimento(),os.getOrdemPagamento().getNumero(),os.getValorTotal(),os.getValorTotal().multiply(PERCENTUAL).setScale(2,RoundingMode.HALF_UP))).toList();
        return new ComissaoResponse(periodo.getId(),calendarios.rotulo(periodo),motorista.getNome(),motorista.getId(),detalhados.size(),producao,PERCENTUAL,bruta,aprovada,pendente,bruta.subtract(aprovada),detalhados.isEmpty(),detalhados,alimentacoes.stream().map(this::alimentacao).toList());
    }
    private Motorista motoristaDoUsuario(UsuarioPrincipal principal){if(principal==null)throw new IllegalArgumentException("Usuário autenticado não identificado.");Usuario usuario=usuarios.findById(principal.id()).orElseThrow(()->new RecursoNaoEncontradoException("Usuário autenticado não encontrado."));return motoristas.findByUsuario(usuario).orElseThrow(()->new IllegalArgumentException("Seu usuário ainda não está vinculado a um motorista."));}
    private Motorista obterMotorista(Long id){return motoristas.findById(id).orElseThrow(()->new RecursoNaoEncontradoException("Motorista não encontrado."));}
    private AlimentacaoResponse alimentacao(Despesa d){return new AlimentacaoResponse(d.getId(),d.getMotorista().getId(),d.getData(),d.getValor(),d.getStatus().name(),d.isAprovada(),d.getObservacoes());}
    private BigDecimal soma(Collection<BigDecimal> valores){return valores.stream().filter(Objects::nonNull).reduce(BigDecimal.ZERO,BigDecimal::add);}
    private String campo(Object valor){return "\""+Objects.toString(valor,"").replace("\"","\"\"")+"\"";}
}
