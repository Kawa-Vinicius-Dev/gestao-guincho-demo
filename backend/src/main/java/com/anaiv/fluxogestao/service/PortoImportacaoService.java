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
        try{byte[] bytes=arquivo.getBytes();PreviaPorto previa=parser.parse(bytes);String hash=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
            if(importacoes.existsByHashArquivo(hash))throw new IllegalArgumentException("Este arquivo já foi importado ou está em conferência.");
            Files.createDirectories(pasta);Path destino=pasta.resolve(UUID.randomUUID()+".csv").normalize();if(!destino.startsWith(pasta))throw new IllegalArgumentException("Nome de arquivo inválido.");Files.write(destino,bytes,StandardOpenOption.CREATE_NEW);
            String conteudo=new String(bytes,StandardCharsets.UTF_8);Importacao imp=new Importacao(nome,hash,destino.toString());
            imp.prepararPorto(previa.tipo(),conteudo.substring(0,Math.min(conteudo.length(),10000)));importacoes.saveAndFlush(imp);return resposta(imp,previa);
        }catch(IllegalArgumentException e){throw e;}catch(Exception e){throw new IllegalArgumentException("Não foi possível preparar o CSV Porto.");}
    }
    @Transactional public ConfirmacaoResponse confirmar(Long id,ConfirmarImportacaoRequest request){Importacao imp=obter(id);
        if(imp.getStatus()!=StatusImportacao.AGUARDANDO_CONFERENCIA||imp.getTipoRelatorioPorto()==null)throw new IllegalArgumentException("Esta importação Porto não pode ser confirmada.");
        PreviaPorto previa;try{previa=parser.parse(Files.readAllBytes(Path.of(imp.getCaminhoArquivo())));}catch(Exception e){throw new IllegalArgumentException("Não foi possível reler o CSV Porto.");}
        OrdemPagamentoPorto op=null;if(previa.tipo()==TipoRelatorioPorto.OS_VINCULADAS){if(request==null||request.ordemPagamentoId()==null)throw new IllegalArgumentException("Selecione a OP vinculada antes de confirmar.");op=porto.obterOp(request.ordemPagamentoId());}
        int importados=0,ignorados=0;for(LinhaPorto linha:previa.linhas()){if(registros.existsByHashRegistro(linha.hashRegistro())){ignorados++;continue;}
            switch(previa.tipo()){case PREVISAO_RECEBER->porto.importarOp(linha,imp);case OS_VINCULADAS->porto.importarOs(linha,op,imp);case SERVICOS_DEVOLVIDOS->porto.importarDevolucao(linha,imp);}
            registros.save(new RegistroImportadoPorto(imp,linha.hashRegistro(),previa.tipo()));importados++;}
        imp.confirmar();return new ConfirmacaoResponse(imp.getId(),previa.tipo(),importados,ignorados);
    }
    private Importacao obter(Long id){return importacoes.findById(id).orElseThrow(()->new RecursoNaoEncontradoException("Importação Porto não encontrada."));}
    private PreviaResponse resposta(Importacao i,PreviaPorto p){return new PreviaResponse(i.getId(),i.getNomeArquivo(),p.tipo(),i.getStatus().name(),p.linhas().size(),p.linhas().stream().map(x->new LinhaPreviaResponse(x.dados(),x.hashRegistro())).toList(),p.erros(),p.tipo()==TipoRelatorioPorto.OS_VINCULADAS);}
}
