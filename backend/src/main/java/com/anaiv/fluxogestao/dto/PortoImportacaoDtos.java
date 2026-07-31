package com.anaiv.fluxogestao.dto;

import com.anaiv.fluxogestao.entity.EnumsFinanceiros.TipoRelatorioPorto;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;

public final class PortoImportacaoDtos {
    private PortoImportacaoDtos() {}
    public record PreviaPorto(TipoRelatorioPorto tipo, List<String> cabecalhos, List<LinhaPorto> linhas, List<String> erros) {}
    public record LinhaPorto(Map<String,String> dados, String hashRegistro) {
        public String texto(String chave){String v=dados.get(chave);return v==null||v.isBlank()?null:v;}
        public BigDecimal decimal(String chave){String v=texto(chave);if(v==null)return null;String limpo=v.replace("R$","").replace(" ","");
            if(limpo.contains(",")&&limpo.contains("."))limpo=limpo.replace(".","").replace(',','.');
            else if(limpo.contains(","))limpo=limpo.replace(',','.');return new BigDecimal(limpo);}
        public LocalDate data(String chave){String v=texto(chave);if(v==null)return null;
            return v.contains("/")?LocalDate.parse(v,DateTimeFormatter.ofPattern("dd/MM/yyyy")):LocalDate.parse(v);}
    }
}
