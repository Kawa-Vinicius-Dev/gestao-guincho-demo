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
public class PortoCsvParser {
    private static final Pattern HTML=Pattern.compile("<[^>]*>");
    private static final Map<String,String> ALIASES=Map.ofEntries(
        Map.entry("numero da ordem de pagamento","numero_op"), Map.entry("valor total do servico","valor_total"),
        Map.entry("nome codigo","nome_codigo"), Map.entry("data de pagamento","data_pagamento"),
        Map.entry("numero da ordem de servico","numero_os"), Map.entry("valor total","valor_total"),
        Map.entry("especialidade","especialidade"), Map.entry("sigla da viatura","sigla_viatura"),
        Map.entry("socorrista","socorrista"), Map.entry("qra","qra"), Map.entry("data de atendimento","data_atendimento"),
        Map.entry("data da devolucao","data_devolucao"), Map.entry("valor km excedente","valor_km_excedente"),
        Map.entry("km morto estimado","km_morto_estimado")
    );

    public PreviaPorto parse(byte[] bytes) {
        String conteudo=decodificar(bytes).replaceFirst("^\\uFEFF","");
        char separador=separador(conteudo.lines().findFirst().orElse(""));
        List<List<String>> registros=registros(conteudo,separador);
        if(registros.size()<2)throw new IllegalArgumentException("O CSV não contém registros para importar.");
        List<String> originais=registros.getFirst();
        List<String> chaves=originais.stream().map(this::normalizar).map(h->ALIASES.getOrDefault(h,h.replace(' ','_'))).toList();
        TipoRelatorioPorto tipo=detectar(new HashSet<>(chaves));
        List<LinhaPorto> linhas=new ArrayList<>(); List<String> erros=new ArrayList<>();
        for(int indice=1;indice<registros.size();indice++){
            List<String> valores=registros.get(indice); if(valores.stream().allMatch(String::isBlank))continue;
            Map<String,String> dados=new LinkedHashMap<>();
            for(int coluna=0;coluna<chaves.size();coluna++) dados.put(chaves.get(coluna),limpar(coluna<valores.size()?valores.get(coluna):""));
            try{validar(tipo,dados);linhas.add(new LinhaPorto(Map.copyOf(dados),hash(tipo,dados)));}
            catch(RuntimeException e){erros.add("Linha "+(indice+1)+": "+e.getMessage());}
        }
        return new PreviaPorto(tipo,List.copyOf(originais),List.copyOf(linhas),List.copyOf(erros));
    }
    private TipoRelatorioPorto detectar(Set<String> h){
        if(h.containsAll(Set.of("numero_op","valor_total","nome_codigo","data_pagamento")))return TipoRelatorioPorto.PREVISAO_RECEBER;
        if(h.containsAll(Set.of("numero_os","especialidade","data_atendimento","data_devolucao","valor_total")))return TipoRelatorioPorto.SERVICOS_DEVOLVIDOS;
        if(h.containsAll(Set.of("numero_os","valor_total","especialidade","sigla_viatura","socorrista","qra","data_atendimento")))return TipoRelatorioPorto.OS_VINCULADAS;
        throw new IllegalArgumentException("Não foi possível detectar um relatório Porto pelos cabeçalhos.");
    }
    private void validar(TipoRelatorioPorto tipo,Map<String,String> d){
        String numero=tipo==TipoRelatorioPorto.PREVISAO_RECEBER?d.get("numero_op"):d.get("numero_os");
        if(numero==null||numero.isBlank())throw new IllegalArgumentException("número da ordem vazio");
        new LinhaPorto(d,"").decimal("valor_total");
        if(tipo==TipoRelatorioPorto.PREVISAO_RECEBER)new LinhaPorto(d,"").data("data_pagamento");
        else new LinhaPorto(d,"").data("data_atendimento");
        if(tipo==TipoRelatorioPorto.SERVICOS_DEVOLVIDOS)new LinhaPorto(d,"").data("data_devolucao");
    }
    private String decodificar(byte[] bytes){
        try{return StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString();}
        catch(CharacterCodingException e){return StandardCharsets.ISO_8859_1.decode(ByteBuffer.wrap(bytes)).toString();}
    }
    private char separador(String cabecalho){char melhor=';';int maior=-1;for(char c:new char[]{';','\t',','}){int n=0;boolean aspas=false;
        for(char x:cabecalho.toCharArray()){if(x=='\"')aspas=!aspas;else if(x==c&&!aspas)n++;}if(n>maior){maior=n;melhor=c;}}return melhor;}
    private List<List<String>> registros(String csv,char separador){List<List<String>> linhas=new ArrayList<>();List<String> linha=new ArrayList<>();StringBuilder campo=new StringBuilder();boolean aspas=false;
        for(int i=0;i<csv.length();i++){char c=csv.charAt(i);if(c=='\"'){if(aspas&&i+1<csv.length()&&csv.charAt(i+1)=='\"'){campo.append('\"');i++;}else aspas=!aspas;}
            else if(c==separador&&!aspas){linha.add(campo.toString());campo.setLength(0);}else if((c=='\n'||c=='\r')&&!aspas){if(c=='\r'&&i+1<csv.length()&&csv.charAt(i+1)=='\n')i++;linha.add(campo.toString());campo.setLength(0);linhas.add(linha);linha=new ArrayList<>();}else campo.append(c);}
        if(campo.length()>0||!linha.isEmpty()){linha.add(campo.toString());linhas.add(linha);}return linhas;}
    private String normalizar(String valor){return Normalizer.normalize(limpar(valor),Normalizer.Form.NFD).replaceAll("\\p{M}","").toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+"," ").trim();}
    private String limpar(String valor){String semHtml=HTML.matcher(valor).replaceAll("");return semHtml.replace("&nbsp;"," ").replace("&amp;","&").trim();}
    private String hash(TipoRelatorioPorto tipo,Map<String,String> dados){try{StringBuilder base=new StringBuilder(tipo.name());dados.entrySet().stream().sorted(Map.Entry.comparingByKey()).forEach(e->base.append('|').append(e.getKey()).append('=').append(e.getValue()));
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(base.toString().getBytes(StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalStateException(e);}}
}
