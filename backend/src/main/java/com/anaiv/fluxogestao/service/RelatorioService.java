package com.anaiv.fluxogestao.service;

import com.anaiv.fluxogestao.dto.FinanceiroDtos.*;
import org.springframework.stereotype.Service;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;

@Service
public class RelatorioService {
    private final FinanceiroService financeiro; private final QuilometragemService quilometragem; private final DashboardService dashboard;
    public RelatorioService(FinanceiroService f,QuilometragemService q,DashboardService d){financeiro=f;quilometragem=q;dashboard=d;}
    public String csv(String tipo,LocalDate inicio,LocalDate fim){
        return switch(tipo){
            case "entradas-saidas","fluxo-caixa" -> fluxo(inicio,fim);
            case "contas-receber" -> contas(false);
            case "contas-atrasadas" -> contas(true);
            case "divergencias" -> divergencias();
            case "despesas-categoria" -> despesasCategoria(inicio,fim);
            case "receita-contratante" -> receitaContratante(inicio,fim);
            case "quilometragem" -> kms(inicio,fim);
            case "resultado-veiculo" -> resultadoVeiculo(inicio,fim);
            default -> throw new IllegalArgumentException("Relatório desconhecido.");
        };
    }
    private String fluxo(LocalDate i,LocalDate f){
        StringBuilder s=cab("Tipo;Data;Descrição;Status;Valor");
        financeiro.listarReceitas().stream().filter(r->entre(r.dataRecebimento()!=null?r.dataRecebimento():r.dataCompetencia(),i,f))
            .forEach(r->linha(s,"Entrada",r.dataRecebimento()!=null?r.dataRecebimento():r.dataCompetencia(),r.descricao(),r.status(),r.valor()));
        financeiro.listarDespesas().stream().filter(d->entre(d.dataPagamento()!=null?d.dataPagamento():d.data(),i,f))
            .forEach(d->linha(s,"Saída",d.dataPagamento()!=null?d.dataPagamento():d.data(),d.descricao(),d.status(),d.valor().negate()));
        return s.toString();
    }
    private String contas(boolean atrasadas){
        StringBuilder s=cab("Contratante;Protocolo;Descrição;Vencimento;Status;Previsto;Recebido;Diferença");
        financeiro.listarContas(null,null).stream().filter(c->!atrasadas||c.status().name().equals("ATRASADO"))
            .forEach(c->linha(s,c.contratante().nome(),c.protocolo(),c.descricao(),c.vencimento(),c.status(),c.valorPrevisto(),c.valorRecebido(),c.diferenca()));
        return s.toString();
    }
    private String divergencias(){
        StringBuilder s=cab("Contratante;Protocolo;Previsto;Recebido;Diferença;Recebimento");
        financeiro.listarContas(null,null).stream().filter(c->c.diferenca()!=null&&c.diferenca().signum()!=0)
            .forEach(c->linha(s,c.contratante().nome(),c.protocolo(),c.valorPrevisto(),c.valorRecebido(),c.diferenca(),c.dataRecebimento()));
        return s.toString();
    }
    private String despesasCategoria(LocalDate i,LocalDate f){
        Map<String,BigDecimal> totais=new TreeMap<>();
        financeiro.listarDespesas().stream().filter(d->entre(d.data(),i,f)).filter(DespesaResponse::aprovada)
            .forEach(d->totais.merge(d.categoria(),d.valor(),BigDecimal::add));
        StringBuilder s=cab("Categoria;Total"); totais.forEach((k,v)->linha(s,k,v)); return s.toString();
    }
    private String receitaContratante(LocalDate i,LocalDate f){
        Map<String,BigDecimal> totais=new TreeMap<>();
        financeiro.listarReceitas().stream().filter(r->entre(r.dataCompetencia(),i,f))
            .forEach(r->totais.merge(Objects.toString(r.contratante(),"Sem contratante"),r.valor(),BigDecimal::add));
        StringBuilder s=cab("Contratante;Total"); totais.forEach((k,v)->linha(s,k,v)); return s.toString();
    }
    private String kms(LocalDate i,LocalDate f){
        StringBuilder s=cab("Data;Veículo;Motorista;Protocolo;Km total;Km remunerado;Km morto;Custo km morto");
        quilometragem.listar().stream().filter(q->entre(q.data(),i,f)).forEach(q->linha(s,q.data(),q.veiculo(),q.motorista(),q.protocolo(),
            q.quilometragemTotal(),q.quilometragemRemunerada(),q.kmMorto(),q.custoKmMorto())); return s.toString();
    }
    private String resultadoVeiculo(LocalDate i,LocalDate f){
        StringBuilder s=cab("Veículo;Receitas;Despesas;Resultado;Km morto;Custo km morto");
        dashboard.dashboard(i,f,null,null,null,null,null).resultadoPorVeiculo().forEach(r->linha(s,r.veiculo(),r.receitas(),r.despesas(),r.resultado(),r.kmMorto(),r.custoKmMorto()));
        return s.toString();
    }
    private boolean entre(LocalDate d,LocalDate i,LocalDate f){return d!=null&&!d.isBefore(i)&&!d.isAfter(f);}
    private StringBuilder cab(String h){return new StringBuilder("\uFEFF").append(h).append("\r\n");}
    private void linha(StringBuilder s,Object... valores){
        for(int i=0;i<valores.length;i++){if(i>0)s.append(';');String v=Objects.toString(valores[i],"").replace("\"","\"\"");
            s.append('"').append(v).append('"');}s.append("\r\n");
    }
}
