package com.anaiv.fluxogestao.service;

import com.anaiv.fluxogestao.dto.PortoDtos.*;
import com.anaiv.fluxogestao.dto.PortoImportacaoDtos.*;
import com.anaiv.fluxogestao.entity.*;
import com.anaiv.fluxogestao.entity.EnumsFinanceiros.*;
import com.anaiv.fluxogestao.exception.RecursoNaoEncontradoException;
import com.anaiv.fluxogestao.repository.*;
import com.anaiv.fluxogestao.security.UsuarioPrincipal;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.util.*;

@Service
public class PortoImportacaoService {
    private final ImportacaoRepository importacoes; private final RegistroImportadoPortoRepository registros;
    private final PortoCsvParser parser;private final PortoBlocosParser blocos; private final PortoService porto;private final PortoFinanceiroService financeiro; private final Path pasta;
    public PortoImportacaoService(ImportacaoRepository i,RegistroImportadoPortoRepository r,PortoCsvParser p,PortoBlocosParser blocos,PortoService porto,PortoFinanceiroService financeiro,@Value("${app.storage-dir}")String storage){
        importacoes=i;registros=r;parser=p;this.blocos=blocos;this.porto=porto;this.financeiro=financeiro;pasta=Path.of(storage).toAbsolutePath().normalize().resolve("porto");}
    @Transactional public PreviaResponse previa(MultipartFile arquivo){
        if(arquivo.isEmpty())throw new IllegalArgumentException("Selecione um arquivo CSV ou TXT.");String nome=arquivo.getOriginalFilename();
        String nomeNormalizado=nome==null?"":nome.toLowerCase(Locale.ROOT);if(!nomeNormalizado.endsWith(".csv")&&!nomeNormalizado.endsWith(".txt"))throw new IllegalArgumentException("A importação Porto aceita CSV ou TXT.");
        try{return preparar(arquivo.getBytes(),nome,nomeNormalizado.endsWith(".txt"),false);}
        catch(IllegalArgumentException e){throw e;}catch(Exception e){throw new IllegalArgumentException("Não foi possível preparar o relatório Porto.");}
    }
    @Transactional public PreviaResponse previaConteudo(ConteudoImportacaoRequest request){
        String conteudo=normalizarConteudo(request.conteudo());if(conteudo.isBlank())throw new IllegalArgumentException("Cole ao menos uma linha de serviços Porto.");
        return preparar(conteudo.getBytes(StandardCharsets.UTF_8),"colagem-servicos-porto.txt",true,true);
    }
    @Transactional public PreviaResponse previaComposicao(Long ordemPagamentoId,MultipartFile arquivo){
        porto.obterOp(ordemPagamentoId);
        if(arquivo.isEmpty())throw new IllegalArgumentException("Selecione o arquivo de composição da OP.");
        String nome=arquivo.getOriginalFilename();String normalizado=nome==null?"":nome.toLowerCase(Locale.ROOT);
        if(!normalizado.endsWith(".csv")&&!normalizado.endsWith(".txt"))throw new IllegalArgumentException("A composição aceita CSV ou TXT tabular.");
        try{PreviaResponse criada=preparar(arquivo.getBytes(),nome,false,false);
            if(criada.tipo()!=TipoRelatorioPorto.OS_VINCULADAS)throw new IllegalArgumentException("O arquivo não corresponde a uma composição de OP.");
            return avaliar(criada.id(),new ConfirmarImportacaoRequest(ordemPagamentoId,false,null,null));
        }catch(IllegalArgumentException e){throw e;}catch(Exception e){throw new IllegalArgumentException("Não foi possível preparar a composição da OP.");}
    }
    private PreviaResponse preparar(byte[] bytes,String nome,boolean servicosGerais,boolean hashNormalizado){
        try{PreviaPorto previa=contextualizar(parse(bytes,servicosGerais));
            byte[] baseHash=hashNormalizado?normalizarConteudo(new String(bytes,StandardCharsets.UTF_8)).getBytes(StandardCharsets.UTF_8):bytes;
            String hash=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(baseHash));
            Optional<Importacao> existente=importacoes.findByHashArquivo(hash);
            if(existente.isPresent()){
                Importacao imp=existente.get();
                if(imp.getTipoRelatorioPorto()==null)throw new IllegalArgumentException("Este arquivo já foi importado por outro fluxo.");
                if(imp.getStatus()==StatusImportacao.AGUARDANDO_CONFERENCIA)return resposta(imp,previa);
                if(imp.getStatus()==StatusImportacao.CANCELADA||imp.getStatus()==StatusImportacao.ERRO_LEITURA){
                    Files.write(Path.of(imp.getCaminhoArquivo()),bytes,StandardOpenOption.WRITE,StandardOpenOption.TRUNCATE_EXISTING);
                    String conteudo=new String(bytes,StandardCharsets.UTF_8);
                    imp.prepararPorto(previa.tipo(),conteudo.substring(0,Math.min(conteudo.length(),10000)));
                    importacoes.saveAndFlush(imp);return resposta(imp,previa);
                }
                if(imp.getStatus()==StatusImportacao.CONFIRMADA){imp.prepararPorto(previa.tipo(),imp.getTextoExtraido());importacoes.saveAndFlush(imp);return resposta(imp,previa);}
                throw new IllegalArgumentException("Este arquivo já foi importado.");
            }
            Files.createDirectories(pasta);Path destino=pasta.resolve(UUID.randomUUID()+(servicosGerais?".txt":".csv")).normalize();if(!destino.startsWith(pasta))throw new IllegalArgumentException("Nome de arquivo inválido.");Files.write(destino,bytes,StandardOpenOption.CREATE_NEW);
            String conteudo=new String(bytes,StandardCharsets.UTF_8);Importacao imp=new Importacao(nome,hash,destino.toString());
            imp.prepararPorto(previa.tipo(),conteudo.substring(0,Math.min(conteudo.length(),10000)));importacoes.saveAndFlush(imp);return resposta(imp,previa);
        }catch(IllegalArgumentException e){throw e;}catch(Exception e){throw new IllegalArgumentException("Não foi possível preparar o relatório Porto.");}
    }
    @Transactional public ConfirmacaoResponse confirmar(Long id,ConfirmarImportacaoRequest request,UsuarioPrincipal principal){Importacao imp=obter(id);
        if(imp.getStatus()==StatusImportacao.CONFIRMADA&&imp.getTipoRelatorioPorto()!=null)return vazia(imp);
        if(imp.getStatus()!=StatusImportacao.AGUARDANDO_CONFERENCIA||imp.getTipoRelatorioPorto()==null)throw new IllegalArgumentException("Esta importação Porto não pode ser confirmada.");
        PreviaPorto previa;try{previa=contextualizar(reler(imp));}catch(Exception e){throw new IllegalArgumentException("Não foi possível reler o relatório Porto.");}
        if(previa.linhas().stream().anyMatch(l->l.acao()==AcaoLinhaPorto.ERRO))throw new IllegalArgumentException("A importação contém linhas com erro; corrija o arquivo e envie novamente.");
        OrdemPagamentoPorto op=null;if(previa.tipo()==TipoRelatorioPorto.OS_VINCULADAS){if(request==null||request.ordemPagamentoId()==null)throw new IllegalArgumentException("Selecione a OP vinculada antes de confirmar.");op=porto.obterOp(request.ordemPagamentoId());previa=avaliarProcessamento(previa,op);}
        if(previa.linhas().stream().anyMatch(l->l.acao()==AcaoLinhaPorto.DIVERGENCIA)&&!Boolean.TRUE.equals(request==null?null:request.confirmarDivergencias()))throw new IllegalArgumentException("Existem divergências de associação; confirme explicitamente para reassociar as OS.");
        List<LinhaPorto> unicas=linhasUnicasValidas(previa);BigDecimal soma=unicas.stream().map(l->l.decimal("valor_total")).filter(Objects::nonNull).reduce(BigDecimal.ZERO,BigDecimal::add);
        List<LocalDate> datasPeriodo=new ArrayList<>();if(op!=null){porto.ossDaOp(op).stream().map(OrdemServicoPorto::getDataAtendimento).filter(Objects::nonNull).forEach(datasPeriodo::add);unicas.stream().map(l->l.data("data_atendimento")).filter(Objects::nonNull).forEach(datasPeriodo::add);}
        PortoFinanceiroService.PeriodoFinanceiro periodo=op==null?null:financeiro.validarPeriodo(datasPeriodo);
        BigDecimal diferenca=null;if(op!=null){diferenca=op.getValorTotal().subtract(soma);if(op.getStatusPorto()!=null&&diferenca.abs().compareTo(new BigDecimal("0.01"))>0&&(request==null||request.motivoDivergencia()==null||request.justificativaDivergencia()==null||request.justificativaDivergencia().isBlank()))throw new IllegalArgumentException("A soma da composição diverge do valor da OP; informe motivo e justificativa.");}
        int importados=0,ignorados=0,novos=0,atualizados=0,receitasCriadas=0,receitasAtualizadas=0;Set<String> processadas=new HashSet<>();
        for(LinhaPorto linha:previa.linhas()){
            String numero=linha.texto(previa.tipo()==TipoRelatorioPorto.PREVISAO_RECEBER?"numero_op":"numero_os");if(numero!=null&&!processadas.add(numero)){ignorados++;continue;}
            String chave=chaveProcessamento(previa.tipo(),linha,op);boolean jaProcessada=linha.acao()==AcaoLinhaPorto.IGNORAR||registros.existsByHashRegistro(chave);
            if(previa.tipo()==TipoRelatorioPorto.OS_VINCULADAS&&!jaProcessada)porto.importarOs(linha,op,imp);
            if(jaProcessada){ignorados++;continue;}
            switch(previa.tipo()){case PREVISAO_RECEBER->porto.importarOp(linha,imp);case SERVICOS_GERAIS->porto.importarOsGeral(linha,imp);case SERVICOS_AGUARDANDO_LANCAMENTO->porto.importarAguardando(linha,imp);case OS_VINCULADAS->{ }case SERVICOS_DEVOLVIDOS->porto.importarDevolucao(linha,imp);}
            registros.save(new RegistroImportadoPorto(imp,chave,previa.tipo()));importados++;if(linha.acao()==AcaoLinhaPorto.ATUALIZAR||linha.acao()==AcaoLinhaPorto.DIVERGENCIA)atualizados++;else novos++;}
        BigDecimal totalRecebido=BigDecimal.ZERO;if(op!=null){for(OrdemServicoPorto os:porto.ossDaOp(op)){PortoFinanceiroService.ResultadoSincronizacao resultado=financeiro.sincronizar(os,op,imp,periodo.calendario());receitasCriadas+=resultado.receitasCriadas();receitasAtualizadas+=resultado.receitasAtualizadas();totalRecebido=totalRecebido.add(resultado.valor());}op.sincronizarRecebimento(totalRecebido,periodo.calendario().getDataPagamento(),periodo.calendario());if(diferenca!=null&&diferenca.abs().compareTo(new BigDecimal("0.01"))>0&&request!=null&&request.motivoDivergencia()!=null&&request.justificativaDivergencia()!=null&&!request.justificativaDivergencia().isBlank())porto.registrarJustificativaImportacao(op,request.motivoDivergencia(),request.justificativaDivergencia(),diferenca,principal);porto.registrarHistoricoImportacao(op,principal,importados,atualizados);}
        imp.confirmar();return new ConfirmacaoResponse(imp.getId(),previa.tipo(),importados,ignorados,novos,atualizados,receitasCriadas,receitasAtualizadas,totalRecebido,periodo==null?null:periodo.rotulo(),periodo==null?null:periodo.calendario().getDataPagamento(),List.of());
    }
    @Transactional public ConfirmacaoResponse reprocessarFinanceiro(Long id){Importacao imp=obter(id);if(imp.getStatus()!=StatusImportacao.CONFIRMADA||imp.getTipoRelatorioPorto()!=TipoRelatorioPorto.OS_VINCULADAS)throw new IllegalArgumentException("Somente uma importação confirmada de OP paga pode ser reprocessada.");List<OrdemServicoPorto> oss=porto.ossDaImportacao(imp);if(oss.isEmpty())throw new IllegalArgumentException("A importação não possui ordens de serviço vinculadas para reprocessar.");Set<OrdemPagamentoPorto> ops=new LinkedHashSet<>();oss.forEach(os->{if(os.getOrdemPagamento()!=null)ops.add(os.getOrdemPagamento());});if(ops.size()!=1)throw new IllegalArgumentException("A importação precisa estar vinculada a uma única OP.");OrdemPagamentoPorto op=ops.iterator().next();PortoFinanceiroService.PeriodoFinanceiro periodo=financeiro.validarPeriodo(oss.stream().map(OrdemServicoPorto::getDataAtendimento).toList());int criadas=0,atualizadas=0;BigDecimal total=BigDecimal.ZERO;for(OrdemServicoPorto os:oss){PortoFinanceiroService.ResultadoSincronizacao r=financeiro.sincronizar(os,op,imp,periodo.calendario());criadas+=r.receitasCriadas();atualizadas+=r.receitasAtualizadas();total=total.add(r.valor());}op.sincronizarRecebimento(total,periodo.calendario().getDataPagamento(),periodo.calendario());return new ConfirmacaoResponse(imp.getId(),imp.getTipoRelatorioPorto(),0,0,0,0,criadas,atualizadas,total,periodo.rotulo(),periodo.calendario().getDataPagamento(),List.of());}
    private ConfirmacaoResponse vazia(Importacao imp){return new ConfirmacaoResponse(imp.getId(),imp.getTipoRelatorioPorto(),0,0,0,0,0,0,BigDecimal.ZERO,null,null,List.of());}
    private List<LinhaPorto> linhasUnicasValidas(PreviaPorto previa){String campo=previa.tipo()==TipoRelatorioPorto.PREVISAO_RECEBER?"numero_op":"numero_os";Set<String> vistos=new HashSet<>();return previa.linhas().stream().filter(l->l.acao()!=AcaoLinhaPorto.ERRO).filter(l->{String numero=l.texto(campo);return numero!=null&&vistos.add(numero);}).toList();}
    @Transactional(readOnly=true) public PreviaResponse avaliar(Long id,ConfirmarImportacaoRequest request){Importacao imp=obter(id);
        if(imp.getStatus()!=StatusImportacao.AGUARDANDO_CONFERENCIA||imp.getTipoRelatorioPorto()!=TipoRelatorioPorto.OS_VINCULADAS)throw new IllegalArgumentException("Esta prévia de OS não pode ser avaliada.");
        if(request==null||request.ordemPagamentoId()==null)throw new IllegalArgumentException("Selecione a OP vinculada antes de avaliar.");
        try{PreviaPorto previa=contextualizar(reler(imp));return resposta(imp,avaliarProcessamento(previa,porto.obterOp(request.ordemPagamentoId())));}
        catch(IllegalArgumentException e){throw e;}catch(Exception e){throw new IllegalArgumentException("Não foi possível reler o CSV Porto.");}
    }
    @Transactional public PreviaResponse cancelar(Long id){Importacao imp=obter(id);
        if(imp.getTipoRelatorioPorto()==null)throw new IllegalArgumentException("Esta não é uma importação Porto.");
        if(imp.getStatus()==StatusImportacao.CONFIRMADA)throw new IllegalArgumentException("Uma importação confirmada não pode ser cancelada.");
        if(imp.getStatus()!=StatusImportacao.CANCELADA)imp.cancelar();
        try{return resposta(imp,contextualizar(reler(imp)));}
        catch(Exception e){throw new IllegalArgumentException("Não foi possível reler o CSV Porto.");}
    }
    private Importacao obter(Long id){return importacoes.findById(id).orElseThrow(()->new RecursoNaoEncontradoException("Importação Porto não encontrada."));}
    private PreviaPorto contextualizar(PreviaPorto previa){
        List<String> erros=new ArrayList<>(previa.erros());List<LinhaPorto> linhas=new ArrayList<>();Set<String> vistos=new HashSet<>();
        String campoNumero=previa.tipo()==TipoRelatorioPorto.PREVISAO_RECEBER?"numero_op":"numero_os";
        for(LinhaPorto linha:previa.linhas()){
            if(linha.acao()!=AcaoLinhaPorto.ERRO){String numero=linha.texto(campoNumero);
                if(numero!=null&&!vistos.add(numero)){linhas.add(linha.comAcao(AcaoLinhaPorto.IGNORAR,"Número duplicado dentro do arquivo."));continue;}
                if(previa.tipo()==TipoRelatorioPorto.PREVISAO_RECEBER){AcaoLinhaPorto acao=porto.classificarOp(linha);linha=linha.comAcao(acao,acao==AcaoLinhaPorto.ATUALIZAR?"A OP existente será atualizada.":acao==AcaoLinhaPorto.IGNORAR?"A OP já está atualizada.":null);}
                else if(previa.tipo()==TipoRelatorioPorto.SERVICOS_GERAIS){AcaoLinhaPorto acao=porto.classificarOsGeral(linha);linha=linha.comAcao(acao,acao==AcaoLinhaPorto.DIVERGENCIA?"A OS existente possui dados diferentes; confirme explicitamente para atualizar.":acao==AcaoLinhaPorto.IGNORAR?"A OS já está atualizada.":null);}
                else if(previa.tipo()==TipoRelatorioPorto.SERVICOS_AGUARDANDO_LANCAMENTO){AcaoLinhaPorto acao=porto.classificarAguardando(linha);linha=linha.comAcao(acao,acao==AcaoLinhaPorto.DIVERGENCIA?"A OS existente possui dados diferentes; confirme explicitamente para revisar.":acao==AcaoLinhaPorto.ATUALIZAR?"A OS existente receberá os campos que estavam vazios.":acao==AcaoLinhaPorto.IGNORAR?"A OS já está atualizada.":null);}
            }
            if(linha.acao()!=AcaoLinhaPorto.ERRO&&previa.tipo()==TipoRelatorioPorto.SERVICOS_DEVOLVIDOS&&!porto.existeOs(linha.texto("numero_os"))){
                String faltante=linha.texto("especialidade")==null?"especialidade":linha.texto("data_atendimento")==null?"data de atendimento":null;
                if(faltante!=null){String mensagem="Nova OS devolvida exige "+faltante+".";erros.add(mensagem);linha=linha.comAcao(AcaoLinhaPorto.ERRO,mensagem);}
            }
            linhas.add(linha);
        }
        return new PreviaPorto(previa.tipo(),previa.cabecalhos(),List.copyOf(linhas),List.copyOf(erros));
    }
    private PreviaPorto avaliarProcessamento(PreviaPorto previa,OrdemPagamentoPorto op){List<LinhaPorto> linhas=previa.linhas().stream().map(linha->{
        if(linha.acao()==AcaoLinhaPorto.ERRO)return linha;
        AcaoLinhaPorto acao=porto.classificarOsComposicao(linha,op);if(acao==AcaoLinhaPorto.DIVERGENCIA)return linha.comAcao(acao,porto.associacaoDivergente(linha.texto("numero_os"),op.getId())?"A OS já está vinculada a outra OP.":"A OS existente possui dados diferentes.");
        return registros.existsByHashRegistro(chaveProcessamento(previa.tipo(),linha,op))?linha.comAcao(AcaoLinhaPorto.IGNORAR,"Linha já processada para esta OP."):linha.comAcao(acao,null);
        }).toList();return new PreviaPorto(previa.tipo(),previa.cabecalhos(),linhas,previa.erros());}
    private String chaveProcessamento(TipoRelatorioPorto tipo,LinhaPorto linha,OrdemPagamentoPorto op){if(tipo!=TipoRelatorioPorto.OS_VINCULADAS)return linha.hashRegistro();
        try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest((linha.hashRegistro()+"|op="+op.getId()).getBytes(StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalStateException(e);}}
    private PreviaPorto parse(byte[] bytes,boolean conteudoLivre){if(blocos.suporta(bytes))return blocos.parse(bytes);return conteudoLivre?parser.parseServicosGerais(bytes):parser.parse(bytes);}
    private PreviaPorto reler(Importacao importacao)throws Exception{byte[] bytes=Files.readAllBytes(Path.of(importacao.getCaminhoArquivo()));
        if(importacao.getTipoRelatorioPorto()==TipoRelatorioPorto.SERVICOS_AGUARDANDO_LANCAMENTO)return blocos.parse(bytes);
        return importacao.getTipoRelatorioPorto()==TipoRelatorioPorto.SERVICOS_GERAIS?parser.parseServicosGerais(bytes):parser.parse(bytes);}
    private String normalizarConteudo(String conteudo){String semBom=conteudo==null?"":conteudo.replace("\uFEFF","").replace("\r\n","\n").replace('\r','\n');
        return String.join("\n",semBom.lines().map(String::stripTrailing).toList()).trim();}
    private ResumoPreviaResponse resumir(PreviaPorto previa){Set<String> unicos=new LinkedHashSet<>();int duplicidades=0;int novos=0;int existentes=0;int atualizados=0;int erros=0;BigDecimal valorTotal=BigDecimal.ZERO;
        String campoNumero=previa.tipo()==TipoRelatorioPorto.PREVISAO_RECEBER?"numero_op":"numero_os";
        for(LinhaPorto linha:previa.linhas()){if(linha.acao()==AcaoLinhaPorto.ERRO){erros++;continue;}String numero=linha.texto(campoNumero);if(numero==null||!unicos.add(numero)){duplicidades++;continue;}
            boolean existe=previa.tipo()==TipoRelatorioPorto.PREVISAO_RECEBER?porto.existeOp(numero):porto.existeOs(numero);if(existe){existentes++;if(linha.acao()==AcaoLinhaPorto.ATUALIZAR)atualizados++;}else novos++;
            BigDecimal valor=linha.decimal("valor_total");if(valor!=null)valorTotal=valorTotal.add(valor);}
        return new ResumoPreviaResponse(previa.linhas().size(),previa.tipo()==TipoRelatorioPorto.PREVISAO_RECEBER?unicos.size():0,novos,existentes,atualizados,duplicidades,erros,valorTotal);}
    private PreviaResponse resposta(Importacao i,PreviaPorto p){return new PreviaResponse(i.getId(),i.getNomeArquivo(),p.tipo(),i.getStatus().name(),p.linhas().size(),p.linhas().stream().map(x->new LinhaPreviaResponse(x.dados(),x.hashRegistro(),x.acao(),x.mensagem())).toList(),p.erros(),p.tipo()==TipoRelatorioPorto.OS_VINCULADAS,resumir(p));}
}
