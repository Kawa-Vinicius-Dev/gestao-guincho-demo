package com.anaiv.fluxogestao.porto;

import com.anaiv.fluxogestao.porto.PortoImportacaoDtos.*;
import com.anaiv.fluxogestao.financeiro.EnumsFinanceiros.TipoRelatorioPorto;
import org.springframework.stereotype.Component;
import java.nio.ByteBuffer;
import java.nio.charset.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.regex.Pattern;

/**
 * Le o painel de acionamentos do dia, copiado da tela da Porto. Diferente dos outros
 * relatorios, esse nao traz valor nem numero de OP: a Porto so gera a OP quando fecha o
 * pagamento, semanas depois. Serve para acompanhar a operacao no mesmo dia; o dinheiro
 * entra depois, pelo relatorio financeiro, na mesma OS (ver OrdemServicoPorto.normalizar).
 *
 * Cada registro ocupa duas linhas fisicas, do jeito que a tela quebra ao copiar:
 * <pre>
 * PORTO SEGURO	5632135/26	SOCORRO	L25
 * QEBSON RAMOS DA SILV	11/09/2026	06:56	06:56	ACIONADO/FINAL	EM PROCESSAMENTO	Nao
 * </pre>
 * A viatura pode vir vazia, e ai a primeira linha tem uma coluna a menos. O nome do
 * socorrista vem cortado pela largura da coluna de origem ("QEBSON RAMOS DA SILV") - por
 * isso ele e guardado so para leitura humana e nunca vincula motorista: quem vincula e o
 * QRA do relatorio financeiro. A equipe tem pai e filho com nomes quase iguais.
 */
@Component
public class PortoPainelDiarioParser {
    /** Numero da OS no painel: 7 digitos, barra, ano. Sem o prefixo de 2 digitos do relatorio financeiro. */
    private static final Pattern NUMERO_PAINEL=Pattern.compile("^\\d{1,8}/\\d{2}$");
    private static final Pattern DATA=Pattern.compile("^\\d{2}/\\d{2}/\\d{4}$");
    private static final Pattern HORA=Pattern.compile("^\\d{2}:\\d{2}(:\\d{2})?$");

    public boolean suporta(byte[] bytes){
        List<String[]> linhas=linhas(decodificar(bytes));
        for(int i=0;i<linhas.size();i++){
            if(!inicioDeRegistro(linhas.get(i)))continue;
            if(temData(linhas.get(i)))return true;                                  // registro em uma linha
            if(i+1<linhas.size()&&complemento(linhas.get(i+1)))return true;          // registro em duas
        }
        return false;
    }

    public PreviaPorto parse(byte[] bytes){
        List<String[]> linhas=linhas(decodificar(bytes).replaceFirst("^\\uFEFF",""));
        List<LinhaPorto> resultado=new ArrayList<>();List<String> erros=new ArrayList<>();int registro=0;
        for(int i=0;i<linhas.size();i++){
            String[] cabeca=linhas.get(i);
            if(!inicioDeRegistro(cabeca))continue;
            registro++;
            Map<String,String> dados=new LinkedHashMap<>();
            dados.put("seguradora",coluna(cabeca,0));dados.put("numero_os",coluna(cabeca,1));
            String tipo=coluna(cabeca,2);
            if(tipo!=null){dados.put("tipo_servico",tipo);
                // Ate o relatorio financeiro chegar com a especialidade real (GUINCHO, TECNICO...),
                // o tipo do painel ocupa o lugar para a listagem do dia nao ficar em branco.
                dados.put("especialidade",tipo);}
            String viatura=coluna(cabeca,3);if(viatura!=null)dados.put("sigla_viatura",viatura);

            // A tela devolve o registro em uma linha so quando a OS ja foi tratada, e em duas
            // enquanto ela esta em processamento - a quebra e da propria origem, nao do usuario.
            // Os dois casos trazem as mesmas colunas; muda so onde elas terminam.
            String[] corpo;
            if(temData(cabeca)){corpo=cabeca;}
            else{
                corpo=i+1<linhas.size()?linhas.get(i+1):null;
                if(corpo==null||!complemento(corpo)){
                    String mensagem="Registro "+registro+": falta a data do atendimento.";
                    erros.add(mensagem);resultado.add(new LinhaPorto(Map.copyOf(dados),hash(dados),AcaoLinhaPorto.ERRO,mensagem));
                    continue;
                }
                i++;
            }
            try{mapearCorpo(corpo,dados);resultado.add(new LinhaPorto(Map.copyOf(dados),hash(dados)));}
            catch(RuntimeException e){String mensagem="Registro "+registro+": "+e.getMessage();
                erros.add(mensagem);resultado.add(new LinhaPorto(Map.copyOf(dados),hash(dados),AcaoLinhaPorto.ERRO,mensagem));}
        }
        if(resultado.isEmpty())throw new IllegalArgumentException("Nenhum acionamento do painel diário foi identificado.");
        return new PreviaPorto(TipoRelatorioPorto.PAINEL_DIARIO,List.of(),List.copyOf(resultado),List.copyOf(erros));
    }

    /**
     * A segunda linha pode vir com o nome do socorrista ou sem: quando a Porto nao registrou
     * quem atendeu, a data assume a primeira posicao. Por isso a leitura se ancora na data,
     * nao na contagem de colunas.
     */
    private void mapearCorpo(String[] corpo,Map<String,String> dados){
        int posicaoData=-1;
        for(int c=0;c<corpo.length;c++) if(DATA.matcher(corpo[c].trim()).matches()){posicaoData=c;break;}
        if(posicaoData<0)throw new IllegalArgumentException("data do atendimento ausente ou fora do formato dd/mm/aaaa");
        if(posicaoData>0){String socorrista=coluna(corpo,posicaoData-1);if(socorrista!=null)dados.put("socorrista",socorrista);}

        // Cabecalho da tela: SOCORRISTA | DATA COMB. | HORA COMB. | HORA PREV. | STATUS | SITUACAO | RETORNO.
        // "COMB." e a data/hora combinada com o cliente. O relatorio financeiro traz depois a data de
        // atendimento de verdade e sobrescreve esta - ate la, a combinada e a melhor informacao que existe.
        String data=corpo[posicaoData].trim();
        String horaCombinada=hora(corpo,posicaoData+1);
        dados.put("data_atendimento",horaCombinada==null?data:data+" "+horaCombinada);
        if(horaCombinada!=null)dados.put("hora_combinada",horaCombinada);
        String horaPrevista=hora(corpo,posicaoData+2);
        if(horaPrevista!=null)dados.put("hora_prevista",horaPrevista);

        List<String> resto=new ArrayList<>();
        for(int c=posicaoData+1;c<corpo.length;c++){String v=corpo[c].trim();if(!v.isEmpty()&&!HORA.matcher(v).matches())resto.add(v);}
        if(!resto.isEmpty())dados.put("status_porto",resto.getFirst());
        if(resto.size()>1)dados.put("situacao_porto",resto.get(1));
        // RETORNO: se o servico tem viagem de volta. Guardado porque pode virar cobranca extra.
        if(resto.size()>2)dados.put("retorno",resto.get(2));

        LinhaPorto linha=new LinhaPorto(dados,"");
        try{linha.data("data_atendimento");}catch(RuntimeException e){throw new IllegalArgumentException("data do atendimento inválida");}
    }

    private boolean inicioDeRegistro(String[] colunas){
        return colunas.length>=3&&NUMERO_PAINEL.matcher(colunas[1].trim()).matches();
    }
    private boolean temData(String[] colunas){
        for(String coluna:colunas) if(DATA.matcher(coluna.trim()).matches()) return true;
        return false;
    }
    /** A segunda linha de um registro e a que tem a data do atendimento e nao comeca outro registro. */
    private boolean complemento(String[] colunas){
        if(inicioDeRegistro(colunas))return false;
        for(String coluna:colunas) if(DATA.matcher(coluna.trim()).matches()) return true;
        return false;
    }
    private String hora(String[] colunas,int indice){
        if(indice<0||indice>=colunas.length)return null;
        String valor=colunas[indice].trim();return HORA.matcher(valor).matches()?valor:null;
    }
    private String coluna(String[] colunas,int indice){
        if(indice<0||indice>=colunas.length)return null;
        String valor=colunas[indice].trim();return valor.isEmpty()?null:valor;
    }
    private List<String[]> linhas(String texto){
        List<String[]> resultado=new ArrayList<>();
        for(String bruta:texto.split("\\R")){if(bruta.isBlank())continue;resultado.add(bruta.split("\t",-1));}
        return resultado;
    }
    private String decodificar(byte[] bytes){try{return StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString();}catch(CharacterCodingException e){return StandardCharsets.ISO_8859_1.decode(ByteBuffer.wrap(bytes)).toString();}}
    private String hash(Map<String,String> dados){try{StringBuilder base=new StringBuilder(TipoRelatorioPorto.PAINEL_DIARIO.name());dados.entrySet().stream().sorted(Map.Entry.comparingByKey()).forEach(e->base.append('|').append(e.getKey()).append('=').append(e.getValue()));return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(base.toString().getBytes(StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalStateException(e);}}
}
