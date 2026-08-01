package com.anaiv.fluxogestao.service;

import com.anaiv.fluxogestao.dto.PortoDtos.*;
import com.anaiv.fluxogestao.dto.PortoImportacaoDtos.*;
import com.anaiv.fluxogestao.entity.*;
import com.anaiv.fluxogestao.entity.EnumsFinanceiros.*;
import com.anaiv.fluxogestao.exception.RecursoNaoEncontradoException;
import com.anaiv.fluxogestao.repository.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;

@Service
public class PortoImportacaoService {
    private final ImportacaoRepository importacoes; private final RegistroImportadoPortoRepository registros;
    private final PortoCsvParser parser; private final PortoService porto; private final Path pasta;
    public PortoImportacaoService(ImportacaoRepository i,RegistroImportadoPortoRepository r,PortoCsvParser p,PortoService porto,@Value("${app.storage-dir}")String storage){
        importacoes=i;registros=r;parser=p;this.porto=porto;pasta=Path.of(storage).toAbsolutePath().normalize().resolve("porto");}
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
    private PreviaResponse preparar(byte[] bytes,String nome,boolean servicosGerais,boolean hashNormalizado){
        try{PreviaPorto previa=contextualizar(servicosGerais?parser.parseServicosGerais(bytes):parser.parse(bytes));
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
    @Transactional public ConfirmacaoResponse confirmar(Long id,ConfirmarImportacaoRequest request){Importacao imp=obter(id);
        if(imp.getStatus()==StatusImportacao.CONFIRMADA&&imp.getTipoRelatorioPorto()!=null)return new ConfirmacaoResponse(imp.getId(),imp.getTipoRelatorioPorto(),0,0,0,0);
        if(imp.getStatus()!=StatusImportacao.AGUARDANDO_CONFERENCIA||imp.getTipoRelatorioPorto()==null)throw new IllegalArgumentException("Esta importação Porto não pode ser confirmada.");
        PreviaPorto previa;try{previa=contextualizar(reler(imp));}catch(Exception e){throw new IllegalArgumentException("Não foi possível reler o relatório Porto.");}
        if(previa.linhas().stream().anyMatch(l->l.acao()==AcaoLinhaPorto.ERRO))throw new IllegalArgumentException("A importação contém linhas com erro; corrija o arquivo e envie novamente.");
        OrdemPagamentoPorto op=null;if(previa.tipo()==TipoRelatorioPorto.OS_VINCULADAS){if(request==null||request.ordemPagamentoId()==null)throw new IllegalArgumentException("Selecione a OP vinculada antes de confirmar.");op=porto.obterOp(request.ordemPagamentoId());previa=avaliarProcessamento(previa,op);}
        if(previa.linhas().stream().anyMatch(l->l.acao()==AcaoLinhaPorto.DIVERGENCIA)&&!Boolean.TRUE.equals(request==null?null:request.confirmarDivergencias()))throw new IllegalArgumentException("Existem divergências de associação; confirme explicitamente para reassociar as OS.");
        int importados=0,ignorados=0,novos=0,atualizados=0;for(LinhaPorto linha:previa.linhas()){String chave=chaveProcessamento(previa.tipo(),linha,op);if(linha.acao()==AcaoLinhaPorto.IGNORAR||registros.existsByHashRegistro(chave)){ignorados++;continue;}
            switch(previa.tipo()){case PREVISAO_RECEBER->porto.importarOp(linha,imp);case SERVICOS_GERAIS->porto.importarOsGeral(linha,imp);case OS_VINCULADAS->porto.importarOs(linha,op,imp);case SERVICOS_DEVOLVIDOS->porto.importarDevolucao(linha,imp);}
            registros.save(new RegistroImportadoPorto(imp,chave,previa.tipo()));importados++;if(linha.acao()==AcaoLinhaPorto.ATUALIZAR||linha.acao()==AcaoLinhaPorto.DIVERGENCIA)atualizados++;else novos++;}
        imp.confirmar();return new ConfirmacaoResponse(imp.getId(),previa.tipo(),importados,ignorados,novos,atualizados);
    }
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
        if(porto.associacaoDivergente(linha.texto("numero_os"),op.getId()))return linha.comAcao(AcaoLinhaPorto.DIVERGENCIA,"A OS já está vinculada a outra OP.");
        return registros.existsByHashRegistro(chaveProcessamento(previa.tipo(),linha,op))?linha.comAcao(AcaoLinhaPorto.IGNORAR,"Linha já processada para esta OP."):linha.comAcao(AcaoLinhaPorto.IMPORTAR,null);
        }).toList();return new PreviaPorto(previa.tipo(),previa.cabecalhos(),linhas,previa.erros());}
    private String chaveProcessamento(TipoRelatorioPorto tipo,LinhaPorto linha,OrdemPagamentoPorto op){if(tipo!=TipoRelatorioPorto.OS_VINCULADAS)return linha.hashRegistro();
        try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest((linha.hashRegistro()+"|op="+op.getId()).getBytes(StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalStateException(e);}}
    private PreviaPorto reler(Importacao importacao)throws Exception{byte[] bytes=Files.readAllBytes(Path.of(importacao.getCaminhoArquivo()));
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
