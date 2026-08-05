package com.anaiv.fluxogestao.service;

import com.anaiv.fluxogestao.dto.PortoDtos.*;
import com.anaiv.fluxogestao.dto.PortoImportacaoDtos.AcaoLinhaPorto;
import com.anaiv.fluxogestao.dto.PortoImportacaoDtos.LinhaPorto;
import com.anaiv.fluxogestao.entity.*;
import com.anaiv.fluxogestao.exception.RecursoNaoEncontradoException;
import com.anaiv.fluxogestao.repository.*;
import com.anaiv.fluxogestao.security.UsuarioPrincipal;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.*;

@Service
public class PortoService {
    private final OrdemPagamentoPortoRepository ops; private final OrdemServicoPortoRepository oss;
    private final PendenciaFinanceiraPortoRepository pendencias;private final JustificativaConciliacaoPortoRepository justificativas;private final UsuarioRepository usuarios;private final CalendarioPagamentoPortoRepository calendario;private final CalendarioPortoService calendarioService;private final HistoricoPortoRepository historicos;
    public PortoService(OrdemPagamentoPortoRepository ops,OrdemServicoPortoRepository oss,PendenciaFinanceiraPortoRepository p,JustificativaConciliacaoPortoRepository j,UsuarioRepository u,CalendarioPagamentoPortoRepository calendario,CalendarioPortoService calendarioService,HistoricoPortoRepository historicos){this.ops=ops;this.oss=oss;pendencias=p;justificativas=j;usuarios=u;this.calendario=calendario;this.calendarioService=calendarioService;this.historicos=historicos;}
    public OrdemPagamentoPorto obterOp(Long id){return ops.findById(id).orElseThrow(()->new RecursoNaoEncontradoException("Ordem de pagamento não encontrada."));}
    public boolean existeOp(String numero){return numero!=null&&ops.findByNumero(numero).isPresent();}
    public boolean existeOs(String numero){return numero!=null&&oss.findByNumero(numero).isPresent();}
    public AcaoLinhaPorto classificarOp(LinhaPorto linha){return ops.findByNumero(linha.texto("numero_op")).map(op->{
        boolean mudou=diferente(op.getValorTotal(),linha.decimal("valor_total"))
            ||diferenteSeInformado(op.getNomeCodigo(),linha.texto("nome_codigo"))
            ||!Objects.equals(op.getDataPagamentoProgramada(),linha.data("data_pagamento"));
        return mudou?AcaoLinhaPorto.ATUALIZAR:AcaoLinhaPorto.IGNORAR;
    }).orElse(AcaoLinhaPorto.IMPORTAR);}
    public AcaoLinhaPorto classificarOsGeral(LinhaPorto linha){return oss.findByNumero(linha.texto("numero_os")).map(os->{
        boolean mudou=diferente(os.getValorTotal(),linha.decimal("valor_total"))
            ||diferenteSeInformado(os.getEspecialidade(),linha.texto("especialidade"))
            ||diferenteSeInformado(os.getSiglaViatura(),linha.texto("sigla_viatura"))
            ||diferenteSeInformado(os.getSocorrista(),linha.texto("socorrista"))
            ||diferenteSeInformado(os.getQra(),linha.texto("qra"))
            ||!Objects.equals(os.getDataAtendimento(),linha.data("data_atendimento"));
        return mudou?AcaoLinhaPorto.DIVERGENCIA:AcaoLinhaPorto.IGNORAR;
    }).orElse(AcaoLinhaPorto.IMPORTAR);}
    public AcaoLinhaPorto classificarAguardando(LinhaPorto linha){return oss.findByNumero(linha.texto("numero_os")).map(os->{boolean conflito=diferentePreenchido(os.getValorTotal(),linha.decimal("valor_total"))||conflita(os.getEspecialidade(),linha.texto("especialidade"))||conflita(os.getSocorrista(),linha.texto("socorrista"))||conflita(os.getQra(),linha.texto("qra"))||conflita(os.getPrestador(),linha.texto("prestador"))||conflita(os.getSeguradora(),linha.texto("seguradora"))||conflita(os.getCliente(),linha.texto("cliente"))||conflita(os.getPlaca(),linha.texto("placa"))||(os.getDataHoraAtendimento()!=null&&linha.dataHora("data_atendimento")!=null&&!os.getDataHoraAtendimento().isEqual(linha.dataHora("data_atendimento")));if(conflito)return AcaoLinhaPorto.DIVERGENCIA;
        boolean completa=(os.getEspecialidade()==null&&linha.texto("especialidade")!=null)||(os.getSocorrista()==null&&linha.texto("socorrista")!=null)||(os.getQra()==null&&linha.texto("qra")!=null)||(os.getPrestador()==null&&linha.texto("prestador")!=null)||(os.getSeguradora()==null&&linha.texto("seguradora")!=null)||(os.getCliente()==null&&linha.texto("cliente")!=null)||(os.getPlaca()==null&&linha.texto("placa")!=null)||(os.getDataHoraAtendimento()==null&&linha.dataHora("data_atendimento")!=null);return completa?AcaoLinhaPorto.ATUALIZAR:AcaoLinhaPorto.IGNORAR;}).orElse(AcaoLinhaPorto.IMPORTAR);}
    public boolean associacaoDivergente(String numero,Long ordemPagamentoId){return oss.findByNumero(numero).map(OrdemServicoPorto::getOrdemPagamento).filter(Objects::nonNull).map(OrdemPagamentoPorto::getId).filter(id->!id.equals(ordemPagamentoId)).isPresent();}
    public AcaoLinhaPorto classificarOsComposicao(LinhaPorto linha,OrdemPagamentoPorto op){return oss.findByNumero(linha.texto("numero_os")).map(os->{
        if(os.getOrdemPagamento()!=null&&!os.getOrdemPagamento().getId().equals(op.getId()))return AcaoLinhaPorto.DIVERGENCIA;
        boolean conflito=diferentePreenchido(os.getValorTotal(),linha.decimal("valor_total"))||conflita(os.getEspecialidade(),linha.texto("especialidade"))
            ||conflita(os.getSiglaViatura(),linha.texto("sigla_viatura"))||conflita(os.getSocorrista(),linha.texto("socorrista"))||conflita(os.getQra(),linha.texto("qra"));
        return conflito?AcaoLinhaPorto.DIVERGENCIA:AcaoLinhaPorto.ATUALIZAR;}).orElse(AcaoLinhaPorto.IMPORTAR);}
    public void importarOp(LinhaPorto l,Importacao i){String numero=l.texto("numero_op");OrdemPagamentoPorto op=ops.findByNumero(numero).orElseGet(()->new OrdemPagamentoPorto(numero,i));
        op.atualizar(l.decimal("valor_total"),l.texto("nome_codigo"),l.data("data_pagamento"),i);ops.save(op);}
    public OrdemServicoPorto importarOs(LinhaPorto l,OrdemPagamentoPorto op,Importacao i){String numero=l.texto("numero_os");OrdemServicoPorto os=oss.findByNumero(numero).orElseGet(()->new OrdemServicoPorto(numero,i));
        os.atualizar(op,l.decimal("valor_total"),l.texto("especialidade"),l.texto("sigla_viatura"),l.texto("socorrista"),l.texto("qra"),
            l.data("data_atendimento"),l.decimal("valor_km_excedente"),l.decimal("km_morto_estimado"),i);
        int ciclos=calendarioService.ciclosUltrapassados(os.getDataPrevistaOriginal(),op.getDataPagamentoProgramada());os.processarEmOp(op,ciclos);return oss.save(os);}
    public OrdemServicoPorto obterOs(String numero){return oss.findByNumero(numero).orElseThrow(()->new RecursoNaoEncontradoException("Ordem de serviço não encontrada."));}
    public List<OrdemServicoPorto> ossDaImportacao(Importacao importacao){return oss.findByImportacao(importacao);}
    public List<OrdemServicoPorto> ossDaOp(OrdemPagamentoPorto op){return oss.findByOrdemPagamento(op);}
    public void importarOsGeral(LinhaPorto l,Importacao i){String numero=l.texto("numero_os");OrdemServicoPorto os=oss.findByNumero(numero).orElseGet(()->new OrdemServicoPorto(numero,i));
        os.atualizar(null,l.decimal("valor_total"),l.texto("especialidade"),l.texto("sigla_viatura"),l.texto("socorrista"),l.texto("qra"),
            l.data("data_atendimento"),l.decimal("valor_km_excedente"),l.decimal("km_morto_estimado"),i);oss.save(os);}
    public void importarAguardando(LinhaPorto l,Importacao i){String numero=l.texto("numero_os");OrdemServicoPorto os=oss.findByNumero(numero).orElseGet(()->new OrdemServicoPorto(numero,i));os.atualizar(null,l.decimal("valor_total"),l.texto("especialidade"),null,l.texto("socorrista"),l.texto("qra"),l.data("data_atendimento"),null,null,i);os.atualizarDadosPorto(l.texto("prestador"),l.texto("seguradora"),l.texto("cliente"),l.texto("placa"),l.dataHora("data_atendimento"));LocalDate previsao=os.getDataPrevistaOriginal()==null?calendarioService.proximaDataAtiva(l.data("data_atendimento")):os.getDataPrevistaOriginal();os.aguardarLancamento(previsao,i);oss.save(os);}
    public void importarDevolucao(LinhaPorto l,Importacao i){String numero=l.texto("numero_os");OrdemServicoPorto os=oss.findByNumero(numero).orElseGet(()->new OrdemServicoPorto(numero,i));
        os.atualizar(null,l.decimal("valor_total"),l.texto("especialidade"),null,null,null,l.data("data_atendimento"),null,null,i);os=oss.save(os);
        os.finalizarDevolucao(l.decimal("valor_total"),l.data("data_devolucao"),l.data("data_finalizacao"),i);oss.save(os);
        pendencias.findByOrdemServico(os).ifPresent(p->{p.resolver();pendencias.save(p);});}
    @Transactional public OrdemPagamentoResponse criarOpManual(OrdemPagamentoRequest request,UsuarioPrincipal principal){if(ops.findByNumero(request.numero().trim()).isPresent())throw new IllegalArgumentException("Já existe uma ordem de pagamento com este número.");
        OrdemPagamentoPorto ordem=new OrdemPagamentoPorto(request.numero().trim(),null);aplicarManual(ordem,request);ordem=ops.save(ordem);historicos.save(new HistoricoPorto(ordem,null,usuario(principal),"OP_CRIADA_MANUALMENTE","Ordem de pagamento criada manualmente."));return op(ordem);}
    @Transactional public OrdemPagamentoResponse atualizarOpManual(Long id,OrdemPagamentoRequest request,UsuarioPrincipal principal){OrdemPagamentoPorto ordem=obterOp(id);ops.findByNumero(request.numero().trim()).filter(x->!x.getId().equals(id)).ifPresent(x->{throw new IllegalArgumentException("Já existe uma ordem de pagamento com este número.");});aplicarManual(ordem,request);historicos.save(new HistoricoPorto(ordem,null,usuario(principal),"OP_ATUALIZADA_MANUALMENTE","Ordem de pagamento atualizada manualmente."));return op(ordem);}
    private void aplicarManual(OrdemPagamentoPorto op,OrdemPagamentoRequest request){if(Boolean.TRUE.equals(request.pagamentoConfirmado())){if(request.dataRecebimento()==null)throw new IllegalArgumentException("Informe a data de recebimento ao confirmar o pagamento no banco.");op.atualizarManual(request.valorInformado(),request.dataPrevista(),request.statusPorto(),EnumsFinanceiros.SituacaoFinanceiraOpPorto.PROGRAMADO,request.observacao(),calendario.findByDataPagamento(request.dataPrevista()).orElse(null));op.confirmarRecebimento(request.valorInformado(),request.dataRecebimento());}
        else{if(request.situacaoFinanceira()==EnumsFinanceiros.SituacaoFinanceiraOpPorto.RECEBIDO)throw new IllegalArgumentException("Confirme o pagamento no banco antes de marcar a OP como recebida.");op.atualizarManual(request.valorInformado(),request.dataPrevista(),request.statusPorto(),request.situacaoFinanceira(),request.observacao(),calendario.findByDataPagamento(request.dataPrevista()).orElse(null));}}
    @Transactional(readOnly=true) public List<OrdemPagamentoResponse> listarOps(){return listarOps(new PortoFiltros(null,null,null,null,null,null,null,null,null));}
    @Transactional(readOnly=true) public List<OrdemPagamentoResponse> listarOps(PortoFiltros filtros){PortoFiltros f=filtros==null?new PortoFiltros(null,null,null,null,null,null,null,null,null):filtros;
        return ops.findAll().stream().sorted(Comparator.comparing(OrdemPagamentoPorto::getNumero)).map(this::op)
            .filter(x->filtrar(x,f)).toList();}
    @Transactional(readOnly=true) public ResumoOrdensPagamentoResponse resumo(PortoFiltros filtros){List<OrdemPagamentoResponse> lista=listarOps(filtros);LocalDate hoje=LocalDate.now();
        List<OrdemPagamentoResponse> semComposicao=lista.stream().filter(x->x.quantidadeOrdensServico()==0).toList();
        List<OrdemPagamentoResponse> conciliadas=lista.stream().filter(x->x.statusConciliacao()==EnumsFinanceiros.StatusConciliacaoPorto.CONCILIADA).toList();
        List<OrdemPagamentoResponse> abaixo=lista.stream().filter(x->x.statusConciliacao()==EnumsFinanceiros.StatusConciliacaoPorto.VALOR_ABAIXO).toList();
        List<OrdemPagamentoResponse> acima=lista.stream().filter(x->x.statusConciliacao()==EnumsFinanceiros.StatusConciliacaoPorto.VALOR_ACIMA).toList();
        List<OrdemPagamentoResponse> divergentes=lista.stream().filter(this::temDivergencia).toList();
        List<OrdemPagamentoResponse> programadas=lista.stream().filter(x->x.dataPagamentoProgramada()!=null).toList();
        List<OrdemPagamentoResponse> recebidas=lista.stream().filter(x->x.dataRecebimento()!=null).toList();
        List<OrdemPagamentoResponse> aguardando=lista.stream().filter(x->x.dataRecebimento()==null).toList();
        List<OrdemPagamentoResponse> vencidas=lista.stream().filter(x->x.dataRecebimento()==null&&x.dataPagamentoProgramada()!=null&&x.dataPagamentoProgramada().isBefore(hoje)).toList();
        BigDecimal previsto=somarPrevisto(lista);BigDecimal medio=lista.isEmpty()?BigDecimal.ZERO:previsto.divide(BigDecimal.valueOf(lista.size()),2,RoundingMode.HALF_UP);
        return new ResumoOrdensPagamentoResponse(lista.size(),previsto,semComposicao.size(),somarPrevisto(semComposicao),conciliadas.size(),somarPrevisto(conciliadas),
            abaixo.size(),somarDivergencia(abaixo),acima.size(),somarDivergencia(acima),divergentes.size(),somarDivergencia(divergentes),
            programadas.size(),somarPrevisto(programadas),recebidas.size(),somarRecebido(recebidas),aguardando.size(),somarPrevisto(aguardando),
            vencidas.size(),somarPrevisto(vencidas),medio,lista.stream().mapToLong(OrdemPagamentoResponse::quantidadeOrdensServico).sum());}
    @Transactional(readOnly=true) public List<OrdemServicoResponse> listarOss(){return listarOss(new PortoOsFiltros(null,null,null,null,null,null,null,null,null,null,null));}
    @Transactional(readOnly=true) public List<OrdemServicoResponse> listarOss(PortoOsFiltros filtros){PortoOsFiltros f=filtros==null?new PortoOsFiltros(null,null,null,null,null,null,null,null,null,null,null):filtros;
        Map<Long,EnumsFinanceiros.StatusConciliacaoPorto> conciliacoes=ops.findAll().stream().collect(java.util.stream.Collectors.toMap(OrdemPagamentoPorto::getId,x->op(x).statusConciliacao()));
        return oss.findAll().stream().sorted(Comparator.comparing(OrdemServicoPorto::getNumero)).map(this::os).filter(x->filtrarOs(x,f,conciliacoes)).toList();}
    @Transactional(readOnly=true) public Map<String,Object> dashboard(PortoFiltros filtrosOp,PortoOsFiltros filtrosOs){ResumoOrdensPagamentoResponse resumo=resumo(filtrosOp);List<OrdemServicoResponse> servicos=listarOss(filtrosOs);Map<String,Object> r=new LinkedHashMap<>();adicionarResumo(r,resumo);
        r.put("quantidadeTotalServicos",servicos.size());r.put("valorTotalRealizado",somarServicos(servicos));
        List<OrdemServicoResponse> aguardando=servicos.stream().filter(x->x.statusFinanceiro()==EnumsFinanceiros.StatusFinanceiroPorto.AGUARDANDO_OP).toList();r.put("quantidadeAguardandoOp",aguardando.size());r.put("valorAguardandoOp",somarServicos(aguardando));
        List<OrdemServicoResponse> programados=servicos.stream().filter(x->x.statusFinanceiro()==EnumsFinanceiros.StatusFinanceiroPorto.PAGAMENTO_PROGRAMADO).toList();r.put("quantidadeServicosPagamentoProgramado",programados.size());r.put("valorServicosPagamentoProgramado",somarServicos(programados));
        r.put("valorPrevistoAReceber",resumo.valorProgramado());r.put("valorConciliado",resumo.valorConciliadas());r.put("valorEfetivamenteRecebido",resumo.valorRecebido());
        List<OrdemServicoResponse> pendentes=servicos.stream().filter(x->x.statusOperacional()==EnumsFinanceiros.StatusOperacionalPorto.PENDENTE_PORTO).toList();r.put("quantidadeServicosPendentes",pendentes.size());r.put("valorServicosPendentes",somarServicos(pendentes));
        r.put("quantidadeServicosDevolvidos",servicos.stream().filter(x->x.statusOperacional()==EnumsFinanceiros.StatusOperacionalPorto.DEVOLVIDO_FINALIZADO).count());
        r.put("porEspecialidade",agrupar(servicos,OrdemServicoResponse::especialidade));r.put("porSocorrista",agrupar(servicos,OrdemServicoResponse::socorrista));
        r.put("evolucaoDiaria",evolucao(servicos,false));r.put("evolucaoMensal",evolucao(servicos,true));return r;}
    @Transactional(readOnly=true) public List<PendenciaResponse> listarPendencias(){List<PendenciaResponse> r=new ArrayList<>();ops.findAll().stream().filter(x->x.getDataRecebimento()==null)
        .forEach(x->r.add(new PendenciaResponse(null,"RECEBIMENTO_OP",x.getId(),x.getNumero(),x.getValorTotal(),x.getDataPagamentoProgramada(),"ABERTA",null,null,null,null,null)));
        pendencias.findAll().stream().filter(x->x.getStatus()==EnumsFinanceiros.StatusPendenciaPorto.ABERTA).forEach(x->r.add(pendencia(x)));
        return r.stream().sorted(Comparator.comparing(PendenciaResponse::data,Comparator.nullsLast(Comparator.naturalOrder()))).toList();}
    @Transactional public PendenciaResponse criarPendencia(PendenciaRequest request){OrdemServicoPorto os=oss.findByNumero(request.numeroOs().trim()).orElseThrow(()->new RecursoNaoEncontradoException("Ordem de serviço Porto não encontrada."));
        if(request.statusFinanceiro()!=EnumsFinanceiros.StatusFinanceiroPorto.AGUARDANDO_OP&&request.statusFinanceiro()!=EnumsFinanceiros.StatusFinanceiroPorto.BLOQUEADO_PARA_PAGAMENTO&&request.statusFinanceiro()!=EnumsFinanceiros.StatusFinanceiroPorto.VALOR_DIVERGENTE)throw new IllegalArgumentException("Selecione uma situação financeira válida para a pendência Porto.");
        PendenciaFinanceiraPorto p=pendencias.findByOrdemServico(os).orElseGet(()->new PendenciaFinanceiraPorto(os,request.motivo().trim(),request.valor(),request.dataPendencia(),request.observacao().trim(),request.responsavel().trim(),request.prazo(),limpar(request.referenciaPorto())));
        p.atualizarTratativa(request.motivo().trim(),request.valor(),request.dataPendencia(),request.observacao().trim(),request.responsavel().trim(),request.prazo(),limpar(request.referenciaPorto()));os.marcarPendente(request.statusFinanceiro());return pendencia(pendencias.save(p));}
    @Transactional public PendenciaResponse resolverPendencia(Long id){PendenciaFinanceiraPorto p=pendencias.findById(id).orElseThrow(()->new RecursoNaoEncontradoException("Pendência Porto não encontrada."));p.resolver();p.getOrdemServico().resolverPendencia();return pendencia(p);}
    @Transactional public OrdemPagamentoResponse receber(Long id,RecebimentoRequest r){OrdemPagamentoPorto op=obterOp(id);op.confirmarRecebimento(r.valorRecebido(),r.dataRecebimento());oss.findByOrdemPagamento(op).forEach(OrdemServicoPorto::marcarRecebida);return op(op);}
    @Transactional(readOnly=true) public OrdemPagamentoDetalheResponse detalhar(Long id){OrdemPagamentoPorto ordem=obterOp(id);return new OrdemPagamentoDetalheResponse(op(ordem),oss.findByOrdemPagamento(ordem).stream().map(this::os).toList(),justificativas.findByOrdemPagamentoOrderByCriadoEmDesc(ordem).stream().map(this::justificativa).toList(),historicos.findByOrdemPagamentoOrderByCriadoEmDesc(ordem).stream().map(this::historico).toList());}
    @Transactional public JustificativaResponse justificar(Long id,JustificativaRequest request,UsuarioPrincipal principal){OrdemPagamentoPorto ordem=obterOp(id);Usuario usuario=usuarios.findById(principal.id()).orElseThrow(()->new RecursoNaoEncontradoException("Usuário autenticado não encontrado."));
        return justificativa(justificativas.save(new JustificativaConciliacaoPorto(ordem,request.motivo(),request.observacao().trim(),usuario)));}
    @Transactional public void registrarJustificativaImportacao(OrdemPagamentoPorto op,EnumsFinanceiros.MotivoJustificativaPorto motivo,String observacao,BigDecimal diferenca,UsuarioPrincipal principal){Usuario usuario=usuario(principal);justificativas.save(new JustificativaConciliacaoPorto(op,motivo,observacao.trim(),diferenca,usuario));}
    @Transactional public void registrarHistoricoImportacao(OrdemPagamentoPorto op,UsuarioPrincipal principal,int importados,int atualizados){historicos.save(new HistoricoPorto(op,null,usuario(principal),"COMPOSICAO_IMPORTADA","Composição confirmada: "+importados+" registro(s), "+atualizados+" atualizado(s)."));}
    private OrdemPagamentoResponse op(OrdemPagamentoPorto x){List<OrdemServicoPorto> vinculadas=oss.findByOrdemPagamento(x);BigDecimal soma=vinculadas.stream().map(OrdemServicoPorto::getValorTotal).filter(Objects::nonNull).reduce(BigDecimal.ZERO,BigDecimal::add);BigDecimal diferenca=x.getValorTotal().subtract(soma);
        EnumsFinanceiros.StatusConciliacaoPorto status=vinculadas.isEmpty()?EnumsFinanceiros.StatusConciliacaoPorto.SEM_COMPOSICAO:diferenca.abs().compareTo(new BigDecimal("0.01"))<=0?EnumsFinanceiros.StatusConciliacaoPorto.CONCILIADA:diferenca.signum()>0?EnumsFinanceiros.StatusConciliacaoPorto.VALOR_ABAIXO:EnumsFinanceiros.StatusConciliacaoPorto.VALOR_ACIMA;
        if(x.getValorRecebido()!=null&&x.getValorRecebido().subtract(x.getValorTotal()).abs().compareTo(new BigDecimal("0.01"))>0)status=EnumsFinanceiros.StatusConciliacaoPorto.RECEBIDA_COM_DIVERGENCIA;
        return new OrdemPagamentoResponse(x.getId(),x.getNumero(),x.getValorTotal(),x.getNomeCodigo(),x.getDataPagamentoProgramada(),x.getValorRecebido(),x.getDataRecebimento(),x.getSituacaoFinanceira().name(),vinculadas.size(),soma,diferenca,status,x.getStatusPorto(),x.getObservacao());}
    private OrdemServicoResponse os(OrdemServicoPorto x){OrdemPagamentoPorto op=x.getOrdemPagamento();return new OrdemServicoResponse(x.getId(),op==null?null:op.getId(),op==null?null:op.getNumero(),x.getNumero(),x.getValorTotal(),x.getEspecialidade(),x.getSiglaViatura(),x.getSocorrista(),x.getQra(),x.getDataAtendimento(),x.getValorKmExcedente(),x.getKmMortoEstimado(),x.getStatusOperacional(),x.getStatusFinanceiro(),x.getDataDevolucao(),x.getDataFinalizacaoDevolucao(),x.getPrestador(),x.getSeguradora(),x.getCliente(),x.getPlaca(),x.getDataHoraAtendimento(),x.getDataPrevistaOriginal(),x.getDataEfetivaPagamento(),x.getCiclosAtraso());}
    private boolean filtrar(OrdemPagamentoResponse x,PortoFiltros f){LocalDate hoje=LocalDate.now();boolean vencida=x.dataRecebimento()==null&&x.dataPagamentoProgramada()!=null&&x.dataPagamentoProgramada().isBefore(hoje);
        if(f.dataInicio()!=null&&(x.dataPagamentoProgramada()==null||x.dataPagamentoProgramada().isBefore(f.dataInicio())))return false;
        if(f.dataFim()!=null&&(x.dataPagamentoProgramada()==null||x.dataPagamentoProgramada().isAfter(f.dataFim())))return false;
        if(f.numero()!=null&&!f.numero().isBlank()&&!x.numero().toLowerCase(Locale.ROOT).contains(f.numero().trim().toLowerCase(Locale.ROOT)))return false;
        if(f.situacaoPagamento()!=null&&!f.situacaoPagamento().isBlank()){String situacao=f.situacaoPagamento().trim().toUpperCase(Locale.ROOT);if(situacao.equals("VENCIDA")&&!vencida)return false;if(situacao.equals("AGUARDANDO_RECEBIMENTO")&&(x.dataRecebimento()!=null||vencida))return false;if(!situacao.equals("VENCIDA")&&!situacao.equals("AGUARDANDO_RECEBIMENTO")&&!situacao.equals(x.situacao()))return false;}
        if(f.statusConciliacao()!=null&&f.statusConciliacao()!=x.statusConciliacao())return false;
        if(f.recebida()!=null&&f.recebida()!=(x.dataRecebimento()!=null))return false;
        if(f.vencida()!=null&&f.vencida()!=vencida)return false;
        if(f.comComposicao()!=null&&f.comComposicao()!=(x.quantidadeOrdensServico()>0))return false;
        return f.comDivergencia()==null||f.comDivergencia()==temDivergencia(x);}
    private boolean filtrarOs(OrdemServicoResponse x,PortoOsFiltros f,Map<Long,EnumsFinanceiros.StatusConciliacaoPorto> conciliacoes){
        if(f.dataInicio()!=null&&(x.dataAtendimento()==null||x.dataAtendimento().isBefore(f.dataInicio())))return false;if(f.dataFim()!=null&&(x.dataAtendimento()==null||x.dataAtendimento().isAfter(f.dataFim())))return false;
        if(!contem(x.numero(),f.numeroOs())||!contem(x.ordemPagamento(),f.numeroOp())||!contem(x.especialidade(),f.especialidade())||!contem(x.socorrista(),f.socorrista())||!contem(x.qra(),f.qra())||!contem(x.viatura(),f.viatura()))return false;
        if(f.statusOperacional()!=null&&f.statusOperacional()!=x.statusOperacional())return false;if(f.statusFinanceiro()!=null&&f.statusFinanceiro()!=x.statusFinanceiro())return false;
        return f.statusConciliacao()==null||(x.ordemPagamentoId()!=null&&f.statusConciliacao()==conciliacoes.get(x.ordemPagamentoId()));}
    private boolean temDivergencia(OrdemPagamentoResponse x){return x.statusConciliacao()==EnumsFinanceiros.StatusConciliacaoPorto.VALOR_ABAIXO||x.statusConciliacao()==EnumsFinanceiros.StatusConciliacaoPorto.VALOR_ACIMA||x.statusConciliacao()==EnumsFinanceiros.StatusConciliacaoPorto.RECEBIDA_COM_DIVERGENCIA;}
    private BigDecimal somarPrevisto(Collection<OrdemPagamentoResponse> itens){return itens.stream().map(OrdemPagamentoResponse::valorTotal).filter(Objects::nonNull).reduce(BigDecimal.ZERO,BigDecimal::add);}
    private BigDecimal somarRecebido(Collection<OrdemPagamentoResponse> itens){return itens.stream().map(OrdemPagamentoResponse::valorRecebido).filter(Objects::nonNull).reduce(BigDecimal.ZERO,BigDecimal::add);}
    private BigDecimal somarDivergencia(Collection<OrdemPagamentoResponse> itens){return itens.stream().map(x->x.statusConciliacao()==EnumsFinanceiros.StatusConciliacaoPorto.RECEBIDA_COM_DIVERGENCIA&&x.valorRecebido()!=null?x.valorTotal().subtract(x.valorRecebido()).abs():x.divergencia()==null?BigDecimal.ZERO:x.divergencia().abs()).reduce(BigDecimal.ZERO,BigDecimal::add);}
    private BigDecimal somarServicos(Collection<OrdemServicoResponse> itens){return itens.stream().map(OrdemServicoResponse::valorTotal).filter(Objects::nonNull).reduce(BigDecimal.ZERO,BigDecimal::add);}
    private boolean contem(String atual,String filtro){return filtro==null||filtro.isBlank()||(atual!=null&&atual.toLowerCase(Locale.ROOT).contains(filtro.trim().toLowerCase(Locale.ROOT)));}
    private List<ResumoGrupoResponse> agrupar(List<OrdemServicoResponse> itens,java.util.function.Function<OrdemServicoResponse,String> campo){Map<String,List<OrdemServicoResponse>> grupos=itens.stream().collect(java.util.stream.Collectors.groupingBy(x->{String valor=campo.apply(x);return valor==null||valor.isBlank()?"Não informado":valor;},TreeMap::new,java.util.stream.Collectors.toList()));
        return grupos.entrySet().stream().map(x->new ResumoGrupoResponse(x.getKey(),x.getValue().size(),somarServicos(x.getValue()))).toList();}
    private List<EvolucaoResponse> evolucao(List<OrdemServicoResponse> itens,boolean mensal){Map<String,List<OrdemServicoResponse>> grupos=itens.stream().filter(x->x.dataAtendimento()!=null).collect(java.util.stream.Collectors.groupingBy(x->mensal?x.dataAtendimento().toString().substring(0,7):x.dataAtendimento().toString(),TreeMap::new,java.util.stream.Collectors.toList()));
        return grupos.entrySet().stream().map(x->new EvolucaoResponse(x.getKey(),x.getValue().size(),somarServicos(x.getValue()))).toList();}
    private void adicionarResumo(Map<String,Object> r,ResumoOrdensPagamentoResponse x){r.put("quantidadeTotalOps",x.quantidadeTotalOps());r.put("valorTotalPrevisto",x.valorTotalPrevisto());r.put("quantidadeSemComposicao",x.quantidadeSemComposicao());r.put("valorSemComposicao",x.valorSemComposicao());r.put("quantidadeConciliadas",x.quantidadeConciliadas());r.put("valorConciliadas",x.valorConciliadas());r.put("quantidadeValorAbaixo",x.quantidadeValorAbaixo());r.put("diferencaTotalAbaixo",x.diferencaTotalAbaixo());r.put("quantidadeValorAcima",x.quantidadeValorAcima());r.put("diferencaTotalAcima",x.diferencaTotalAcima());r.put("quantidadeComDivergencia",x.quantidadeComDivergencia());r.put("valorTotalDivergencias",x.valorTotalDivergencias());r.put("quantidadePagamentoProgramado",x.quantidadePagamentoProgramado());r.put("valorProgramado",x.valorProgramado());r.put("quantidadeRecebidas",x.quantidadeRecebidas());r.put("valorRecebido",x.valorRecebido());r.put("quantidadeAguardandoRecebimento",x.quantidadeAguardandoRecebimento());r.put("valorAguardandoRecebimento",x.valorAguardandoRecebimento());r.put("quantidadeVencidasNaoRecebidas",x.quantidadeVencidasNaoRecebidas());r.put("valorVencidoNaoRecebido",x.valorVencidoNaoRecebido());r.put("valorMedioPorOp",x.valorMedioPorOp());r.put("quantidadeOrdensServico",x.quantidadeOrdensServico());}
    private boolean diferente(BigDecimal atual,BigDecimal novo){return novo!=null&&(atual==null||atual.compareTo(novo)!=0);}
    private boolean diferentePreenchido(BigDecimal atual,BigDecimal novo){return atual!=null&&atual.signum()!=0&&novo!=null&&atual.compareTo(novo)!=0;}
    private boolean conflita(String atual,String novo){return atual!=null&&!atual.isBlank()&&novo!=null&&!novo.isBlank()&&!atual.equals(novo);}
    private boolean diferenteSeInformado(String atual,String novo){return novo!=null&&!Objects.equals(atual,novo);}
    private JustificativaResponse justificativa(JustificativaConciliacaoPorto x){return new JustificativaResponse(x.getId(),x.getMotivo(),x.getObservacao(),x.getValorDiferenca(),x.getUsuario().getNome(),x.getCriadoEm());}
    private HistoricoResponse historico(HistoricoPorto x){return new HistoricoResponse(x.getId(),x.getEvento(),x.getDescricao(),x.getUsuario()==null?null:x.getUsuario().getNome(),x.getCriadoEm());}
    private Usuario usuario(UsuarioPrincipal principal){if(principal==null)throw new IllegalArgumentException("Usuário autenticado não identificado.");return usuarios.findById(principal.id()).orElseThrow(()->new RecursoNaoEncontradoException("Usuário autenticado não encontrado."));}
    private PendenciaResponse pendencia(PendenciaFinanceiraPorto x){return new PendenciaResponse(x.getId(),x.getTipo(),x.getOrdemServico().getId(),x.getOrdemServico().getNumero(),x.getValor(),x.getDataDevolucao(),x.getStatus().name(),x.getMotivo(),x.getObservacao(),x.getResponsavel(),x.getPrazo(),x.getReferenciaPorto());}
    private String limpar(String valor){return valor==null||valor.isBlank()?null:valor.trim();}
}
