package com.anaiv.fluxogestao.service;

import com.anaiv.fluxogestao.entity.Motorista;
import com.anaiv.fluxogestao.entity.OrdemServicoPorto;
import com.anaiv.fluxogestao.repository.MotoristaRepository;
import org.springframework.stereotype.Service;

import java.util.Optional;

@Service
public class MotoristaPortoResolver {
    private final MotoristaRepository motoristas;
    public MotoristaPortoResolver(MotoristaRepository motoristas){this.motoristas=motoristas;}

    /**
     * A associacao e feita exclusivamente pelo QRA. No relatorio da Porto o mesmo nome aparece com
     * QRAs diferentes (matricula e identificador interno) e cada QRA corresponde a uma pessoa
     * distinta, entao casar por nome fundiria cadastros que devem ficar separados.
     *
     * Toda OS com QRA sai da importacao com socorrista: se o QRA ainda nao existe, o cadastro e
     * criado na hora com o nome que veio no relatorio. Sem isso a OS nao entra na comissao nem no
     * custo por viatura, que e o resto do sistema. O que falta no cadastro novo e a viatura, que a
     * Porto nao informa - ela e atribuida depois, na tela de Socorristas.
     *
     * Excecao unica: OS sem QRA. Essa fica sem socorrista, porque nao ha identidade para criar.
     */
    public Motorista resolver(OrdemServicoPorto os){
        if(!preenchido(os.getQra()))return null;
        String qra=os.getQra().trim();
        Optional<Motorista> cadastrado=motoristas.findByQraIgnoreCase(qra);
        // QRA de quem saiu da equipe existe, mas nao recebe vinculo novo - e nao pode virar duplicata
        if(cadastrado.isPresent())return cadastrado.filter(Motorista::isAtivo).orElse(null);
        return motoristas.save(new Motorista(nomeDoRelatorio(os,qra),null,null,qra,null,null));
    }
    private String nomeDoRelatorio(OrdemServicoPorto os,String qra){
        return preenchido(os.getSocorrista())?os.getSocorrista().trim():"Socorrista QRA "+qra;
    }
    /**
     * QRA de quem saiu da equipe. Nao serve para vincular OS nova, mas tambem nao pode apagar o
     * vinculo de uma OS antiga numa reimportacao: quem atendeu aquele servico continua sendo ele.
     */
    public boolean desativado(OrdemServicoPorto os){
        return preenchido(os.getQra())&&motoristas.findByQraIgnoreCase(os.getQra().trim()).filter(x->!x.isAtivo()).isPresent();
    }
    private boolean preenchido(String valor){return valor!=null&&!valor.isBlank();}
}
