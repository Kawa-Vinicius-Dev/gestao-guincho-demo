package com.anaiv.fluxogestao.service;

import com.anaiv.fluxogestao.dto.FinanceiroDtos.ContaRequest;
import com.anaiv.fluxogestao.dto.ImportacaoDtos.*;
import com.anaiv.fluxogestao.entity.*;
import com.anaiv.fluxogestao.entity.EnumsFinanceiros.*;
import com.anaiv.fluxogestao.exception.RecursoNaoEncontradoException;
import com.anaiv.fluxogestao.repository.ImportacaoRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import java.nio.file.*;
import java.security.MessageDigest;
import java.time.OffsetDateTime;
import java.util.*;

@Service
public class ImportacaoService {
    private final ImportacaoRepository repository; private final LeitorDocumentoPortoSeguro leitor;
    private final CadastroService cadastros; private final FinanceiroService financeiro; private final Path pasta;
    public ImportacaoService(ImportacaoRepository r,LeitorDocumentoPortoSeguro l,CadastroService c,FinanceiroService f,
                             @Value("${app.storage-dir}") String storage){
        repository=r;leitor=l;cadastros=c;financeiro=f;pasta=Path.of(storage).toAbsolutePath().normalize();
    }
    @Transactional
    public ImportacaoResponse importar(MultipartFile arquivo){
        if(arquivo.isEmpty()) throw new IllegalArgumentException("Selecione um arquivo PDF.");
        if(arquivo.getOriginalFilename()==null||!arquivo.getOriginalFilename().toLowerCase().endsWith(".pdf"))
            throw new IllegalArgumentException("A importação aceita somente arquivos PDF.");
        try{
            byte[] bytes=arquivo.getBytes();
            String hash=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
            if(repository.existsByHashArquivo(hash)) throw new IllegalArgumentException("Este documento já foi importado.");
            Files.createDirectories(pasta);
            Path destino=pasta.resolve(UUID.randomUUID()+".pdf").normalize();
            if(!destino.startsWith(pasta)) throw new IllegalArgumentException("Nome de arquivo inválido.");
            Files.write(destino,bytes,StandardOpenOption.CREATE_NEW);
            Importacao i=repository.save(new Importacao(arquivo.getOriginalFilename(),hash,destino.toString()));
            var resultado=leitor.ler(bytes);
            if(resultado.requerOcr()) i.falhar("O PDF não contém texto pesquisável. Será necessário OCR quando o formato real for configurado.");
            else i.leituraConcluida(resultado.texto().substring(0,Math.min(resultado.texto().length(),10000)));
            return resposta(i);
        }catch(IllegalArgumentException e){throw e;}catch(Exception e){throw new IllegalArgumentException("Não foi possível armazenar o PDF.");}
    }
    @Transactional(readOnly=true) public List<ImportacaoResponse> listar(){
        return repository.findAll().stream().sorted(Comparator.comparing(Importacao::getCriadoEm).reversed()).map(this::resposta).toList();
    }
    @Transactional public ImportacaoResponse adicionarItem(Long id,ItemRequest r){
        Importacao i=obter(id); if(i.getStatus()!=StatusImportacao.AGUARDANDO_CONFERENCIA) throw new IllegalArgumentException("Esta importação não está aberta para conferência.");
        var item=new ItemImportacao(i,r.protocolo(),r.dataServico(),r.veiculoAtendido(),r.placaAtendida(),r.origem(),r.destino(),
            r.valor(),r.kmRemunerado(),cadastros.obterMotorista(r.motoristaId()),cadastros.obterVeiculo(r.veiculoId()),r.previsaoPagamento(),r.observacoes());
        i.adicionar(item);
        repository.saveAndFlush(i);
        return resposta(i);
    }
    @Transactional public ImportacaoResponse confirmar(Long id,ConfirmarRequest r){
        Importacao i=obter(id);
        if(i.getStatus()!=StatusImportacao.AGUARDANDO_CONFERENCIA) throw new IllegalArgumentException("Esta importação não pode ser confirmada.");
        if(i.getItens().isEmpty()) throw new IllegalArgumentException("Inclua ao menos um lançamento conferido antes de confirmar.");
        for(ItemImportacao item:i.getItens()){
            ContaRequest conta=new ContaRequest(r.contratanteId(),item.getProtocolo(),"Serviço Porto Seguro"+(item.getProtocolo()==null?"":" · "+item.getProtocolo()),
                item.getValor(),item.getDataServico(),item.getPrevisaoPagamento(),item.getVeiculo()==null?null:item.getVeiculo().getId(),
                item.getObservacoes(),OrigemLancamento.IMPORTADA);
            financeiro.salvarImportada(financeiro.novaConta(conta,i));
        }
        i.confirmar(); return resposta(i);
    }
    @Transactional public ImportacaoResponse cancelar(Long id){Importacao i=obter(id);i.cancelar();return resposta(i);}
    private Importacao obter(Long id){return repository.findById(id).orElseThrow(()->new RecursoNaoEncontradoException("Importação não encontrada."));}
    private ImportacaoResponse resposta(Importacao i){return new ImportacaoResponse(i.getId(),i.getNomeArquivo(),i.getStatus(),i.getTextoExtraido(),
        i.getMensagemErro(),i.getTotalRegistros(),i.getCriadoEm(),i.getConfirmadoEm(),i.getItens().stream().map(this::item).toList());}
    private ItemResponse item(ItemImportacao x){return new ItemResponse(x.getId(),x.getProtocolo(),x.getDataServico(),x.getVeiculoAtendido(),
        x.getPlacaAtendida(),x.getOrigem(),x.getDestino(),x.getValor(),x.getKmRemunerado(),x.getMotorista()==null?null:x.getMotorista().getNome(),
        x.getVeiculo()==null?null:x.getVeiculo().getIdentificacao(),x.getPrevisaoPagamento(),x.getObservacoes());}
}
