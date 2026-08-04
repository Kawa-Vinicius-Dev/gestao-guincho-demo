package com.anaiv.fluxogestao.service;

import com.anaiv.fluxogestao.dto.PortoImportacaoDtos.*;
import com.anaiv.fluxogestao.entity.EnumsFinanceiros.TipoRelatorioPorto;
import org.springframework.stereotype.Component;
import java.nio.ByteBuffer;
import java.nio.charset.*;
import java.security.MessageDigest;
import java.text.Normalizer;
import java.util.*;
import java.util.regex.Pattern;

@Component
public class PortoBlocosParser {
    private static final Pattern INICIO_OS=Pattern.compile("^(?:OS\\s*)?\\d{2}/\\d{7}-\\d{2}$",Pattern.CASE_INSENSITIVE);
    private static final Pattern VALOR=Pattern.compile("^R\\$\\s*[0-9.]+,[0-9]{2}$",Pattern.CASE_INSENSITIVE);
    private static final Pattern QRA=Pattern.compile("^[0-9][0-9.\\-]{2,}$");

    public boolean suporta(byte[] bytes){String texto=decodificar(bytes);return texto.lines().map(String::trim).anyMatch(x->INICIO_OS.matcher(x).matches())&&normalizar(texto).contains("aguardando lancamento");}

    public PreviaPorto parse(byte[] bytes){String texto=decodificar(bytes).replaceFirst("^\\uFEFF","");List<List<String>> blocos=blocos(texto);if(blocos.isEmpty())throw new IllegalArgumentException("Nenhum serviço em blocos foi identificado.");
        List<LinhaPorto> linhas=new ArrayList<>();List<String> erros=new ArrayList<>();int numero=0;for(List<String> bloco:blocos){numero++;Map<String,String> dados=new LinkedHashMap<>();dados.put("numero_os",bloco.getFirst());
            try{mapear(bloco,dados);linhas.add(new LinhaPorto(Map.copyOf(dados),hash(dados)));}
            catch(RuntimeException e){String mensagem="Bloco "+numero+": "+e.getMessage();erros.add(mensagem);linhas.add(new LinhaPorto(Map.copyOf(dados),hash(dados),AcaoLinhaPorto.ERRO,mensagem));}}
        return new PreviaPorto(TipoRelatorioPorto.SERVICOS_AGUARDANDO_LANCAMENTO,List.of(),List.copyOf(linhas),List.copyOf(erros));}

    private void mapear(List<String> b,Map<String,String> d){if(b.size()<9)throw new IllegalArgumentException("registro incompleto: valor ou status ausente");String status=b.getLast();String valor=b.get(b.size()-2);
        if(!normalizar(status).equals("aguardando lancamento"))throw new IllegalArgumentException("status Aguardando Lançamento ausente");if(!VALOR.matcher(valor).matches())throw new IllegalArgumentException("valor brasileiro inválido ou ausente");
        d.put("prestador",b.get(1));d.put("data_atendimento",b.get(2));d.put("seguradora",b.get(3));d.put("especialidade",b.get(4));d.put("cliente",b.get(5));d.put("placa",b.get(6));d.put("valor_total",valor);d.put("status_porto_servico",status);
        List<String> opcionais=b.subList(7,b.size()-2);if(opcionais.size()>2)throw new IllegalArgumentException("campos opcionais não reconhecidos");for(String opcional:opcionais){if(QRA.matcher(opcional).matches())d.put("qra",opcional);else if(!d.containsKey("socorrista"))d.put("socorrista",opcional);else throw new IllegalArgumentException("campos opcionais ambíguos");}
        LinhaPorto linha=new LinhaPorto(d,"");try{linha.dataHora("data_atendimento");linha.decimal("valor_total");}catch(RuntimeException e){throw new IllegalArgumentException("data, hora ou valor inválido");}}
    private List<List<String>> blocos(String texto){List<List<String>> resultado=new ArrayList<>();List<String> atual=null;for(String bruta:texto.split("\\R")){String linha=bruta.trim();if(linha.isEmpty())continue;if(INICIO_OS.matcher(linha).matches()){if(atual!=null)resultado.add(atual);atual=new ArrayList<>();}if(atual!=null)atual.add(linha);}if(atual!=null)resultado.add(atual);return resultado;}
    private String decodificar(byte[] bytes){try{return StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString();}catch(CharacterCodingException e){return StandardCharsets.ISO_8859_1.decode(ByteBuffer.wrap(bytes)).toString();}}
    private String normalizar(String valor){return Normalizer.normalize(valor,Normalizer.Form.NFD).replaceAll("\\p{M}","").toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+"," ").trim();}
    private String hash(Map<String,String> dados){try{StringBuilder base=new StringBuilder(TipoRelatorioPorto.SERVICOS_AGUARDANDO_LANCAMENTO.name());dados.entrySet().stream().sorted(Map.Entry.comparingByKey()).forEach(e->base.append('|').append(e.getKey()).append('=').append(e.getValue()));return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(base.toString().getBytes(StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalStateException(e);}}
}
