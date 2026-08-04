package com.anaiv.fluxogestao.dto;

import com.anaiv.fluxogestao.entity.EnumsFinanceiros.TipoRelatorioPorto;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.ResolverStyle;
import java.util.List;
import java.util.Map;

public final class PortoImportacaoDtos {
    private PortoImportacaoDtos() {}
    public enum AcaoLinhaPorto { IMPORTAR, ATUALIZAR, IGNORAR, ERRO, DIVERGENCIA }
    public record PreviaPorto(TipoRelatorioPorto tipo, List<String> cabecalhos, List<LinhaPorto> linhas, List<String> erros) {}
    public record LinhaPorto(Map<String,String> dados, String hashRegistro, AcaoLinhaPorto acao, String mensagem) {
        public LinhaPorto(Map<String,String> dados,String hashRegistro){this(dados,hashRegistro,AcaoLinhaPorto.IMPORTAR,null);}
        public LinhaPorto comAcao(AcaoLinhaPorto novaAcao,String novaMensagem){return new LinhaPorto(dados,hashRegistro,novaAcao,novaMensagem);}
        public String texto(String chave){String v=dados.get(chave);return v==null||v.isBlank()?null:v;}
        public BigDecimal decimal(String chave){String v=texto(chave);if(v==null)return null;String limpo=v.replace("R$","").replace(" ","");
            if(limpo.contains(",")&&limpo.contains("."))limpo=limpo.replace(".","").replace(',','.');
            else if(limpo.contains(","))limpo=limpo.replace(',','.');return new BigDecimal(limpo);}
        public LocalDate data(String chave){String v=texto(chave);if(v==null)return null;
            if(v.contains("/"))return LocalDate.parse(v.substring(0,Math.min(10,v.length())),DateTimeFormatter.ofPattern("dd/MM/uuuu").withResolverStyle(ResolverStyle.STRICT));
            return LocalDate.parse(v.substring(0,Math.min(10,v.length())));}
        public OffsetDateTime dataHora(String chave){String v=texto(chave);if(v==null)return null;try{if(v.contains("/")){DateTimeFormatter f=DateTimeFormatter.ofPattern(v.length()>16?"dd/MM/uuuu HH:mm:ss":"dd/MM/uuuu HH:mm").withResolverStyle(ResolverStyle.STRICT);return LocalDateTime.parse(v,f).atZone(ZoneId.of("America/Fortaleza")).toOffsetDateTime();}return LocalDateTime.parse(v.replace(' ','T')).atZone(ZoneId.of("America/Fortaleza")).toOffsetDateTime();}catch(RuntimeException e){return OffsetDateTime.parse(v);}}
    }
}
