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
        if(arquivo.isEmpty())throw new IllegalArgumentException("Selecione um arquivo CSV.");String nome=arquivo.getOriginalFilename();
        if(nome==null||!nome.toLowerCase(Locale.ROOT).endsWith(".csv"))throw new IllegalArgumentException("A importação Porto aceita somente CSV.");
        try{byte[] bytes=arquivo.getBytes();PreviaPorto previa=contextualizar(parser.parse(bytes));String hash=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
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
                if(imp.getStatus()==StatusImportacao.CONFIRMADA&&previa.tipo()==TipoRelatorioPorto.OS_VINCULADAS){imp.prepararPorto(previa.tipo(),imp.getTextoExtraido());importacoes.saveAndFlush(imp);return resposta(imp,previa);}
                throw new IllegalArgumentException("Este arquivo já foi importado.");
            }
            Files.createDirectories(pasta);Path destino=pasta.resolve(UUID.randomUUID()+".csv").normalize();if(!destino.startsWith(pasta))throw new IllegalArgumentException("Nome de arquivo inválido.");Files.write(destino,bytes,StandardOpenOption.CREATE_NEW);
            String conteudo=new String(bytes,StandardCharsets.UTF_8);Importacao imp=new Importacao(nome,hash,destino.toString());
            imp.prepararPorto(previa.tipo(),conteudo.substring(0,Math.min(conteudo.length(),10000)));importacoes.saveAndFlush(imp);return resposta(imp,previa);
        }catch(IllegalArgumentException e){throw e;}catch(Exception e){throw new IllegalArgumentException("Não foi possível preparar o CSV Porto.");}
    }
    @Transactional public ConfirmacaoResponse confirmar(Long id,ConfirmarImportacaoRequest request){Importacao imp=obter(id);
        if(imp.getStatus()==StatusImportacao.CONFIRMADA&&imp.getTipoRelatorioPorto()!=null)return new ConfirmacaoResponse(imp.getId(),imp.getTipoRelatorioPorto(),0,0);
        if(imp.getStatus()!=StatusImportacao.AGUARDANDO_CONFERENCIA||imp.getTipoRelatorioPorto()==null)throw new IllegalArgumentException("Esta importação Porto não pode ser confirmada.");
        PreviaPorto previa;try{previa=contextualizar(parser.parse(Files.readAllBytes(Path.of(imp.getCaminhoArquivo()))));}catch(Exception e){throw new IllegalArgumentException("Não foi possível reler o CSV Porto.");}
        if(previa.linhas().stream().anyMatch(l->l.acao()==AcaoLinhaPorto.ERRO))throw new IllegalArgumentException("A importação contém linhas com erro; corrija o arquivo e envie novamente.");
        OrdemPagamentoPorto op=null;if(previa.tipo()==TipoRelatorioPorto.OS_VINCULADAS){if(request==null||request.ordemPagamentoId()==null)throw new IllegalArgumentException("Selecione a OP vinculada antes de confirmar.");op=porto.obterOp(request.ordemPagamentoId());previa=avaliarProcessamento(previa,op);}
        if(previa.linhas().stream().anyMatch(l->l.acao()==AcaoLinhaPorto.DIVERGENCIA)&&!Boolean.TRUE.equals(request==null?null:request.confirmarDivergencias()))throw new IllegalArgumentException("Existem divergências de associação; confirme explicitamente para reassociar as OS.");
        int importados=0,ignorados=0;for(LinhaPorto linha:previa.linhas()){String chave=chaveProcessamento(previa.tipo(),linha,op);if(linha.acao()==AcaoLinhaPorto.IGNORAR||registros.existsByHashRegistro(chave)){ignorados++;continue;}
            switch(previa.tipo()){case PREVISAO_RECEBER->porto.importarOp(linha,imp);case OS_VINCULADAS->porto.importarOs(linha,op,imp);case SERVICOS_DEVOLVIDOS->porto.importarDevolucao(linha,imp);}
            registros.save(new RegistroImportadoPorto(imp,chave,previa.tipo()));importados++;}
        imp.confirmar();return new ConfirmacaoResponse(imp.getId(),previa.tipo(),importados,ignorados);
    }
    @Transactional(readOnly=true) public PreviaResponse avaliar(Long id,ConfirmarImportacaoRequest request){Importacao imp=obter(id);
        if(imp.getStatus()!=StatusImportacao.AGUARDANDO_CONFERENCIA||imp.getTipoRelatorioPorto()!=TipoRelatorioPorto.OS_VINCULADAS)throw new IllegalArgumentException("Esta prévia de OS não pode ser avaliada.");
        if(request==null||request.ordemPagamentoId()==null)throw new IllegalArgumentException("Selecione a OP vinculada antes de avaliar.");
        try{PreviaPorto previa=contextualizar(parser.parse(Files.readAllBytes(Path.of(imp.getCaminhoArquivo()))));return resposta(imp,avaliarProcessamento(previa,porto.obterOp(request.ordemPagamentoId())));}
        catch(IllegalArgumentException e){throw e;}catch(Exception e){throw new IllegalArgumentException("Não foi possível reler o CSV Porto.");}
    }
    @Transactional public PreviaResponse cancelar(Long id){Importacao imp=obter(id);
        if(imp.getTipoRelatorioPorto()==null)throw new IllegalArgumentException("Esta não é uma importação Porto.");
        if(imp.getStatus()==StatusImportacao.CONFIRMADA)throw new IllegalArgumentException("Uma importação confirmada não pode ser cancelada.");
        if(imp.getStatus()!=StatusImportacao.CANCELADA)imp.cancelar();
        try{return resposta(imp,contextualizar(parser.parse(Files.readAllBytes(Path.of(imp.getCaminhoArquivo())))));}
        catch(Exception e){throw new IllegalArgumentException("Não foi possível reler o CSV Porto.");}
    }
    private Importacao obter(Long id){return importacoes.findById(id).orElseThrow(()->new RecursoNaoEncontradoException("Importação Porto não encontrada."));}
    private PreviaPorto contextualizar(PreviaPorto previa){
        if(previa.tipo()!=TipoRelatorioPorto.SERVICOS_DEVOLVIDOS)return previa;
        List<String> erros=new ArrayList<>(previa.erros());List<LinhaPorto> linhas=new ArrayList<>();
        for(LinhaPorto linha:previa.linhas()){
            if(linha.acao()!=AcaoLinhaPorto.ERRO&&!porto.existeOs(linha.texto("numero_os"))){
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
    private PreviaResponse resposta(Importacao i,PreviaPorto p){return new PreviaResponse(i.getId(),i.getNomeArquivo(),p.tipo(),i.getStatus().name(),p.linhas().size(),p.linhas().stream().map(x->new LinhaPreviaResponse(x.dados(),x.hashRegistro(),x.acao(),x.mensagem())).toList(),p.erros(),p.tipo()==TipoRelatorioPorto.OS_VINCULADAS);}
}
