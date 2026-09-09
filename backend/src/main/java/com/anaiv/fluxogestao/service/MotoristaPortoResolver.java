package com.anaiv.fluxogestao.service;

import com.anaiv.fluxogestao.entity.Motorista;
import com.anaiv.fluxogestao.entity.OrdemServicoPorto;
import com.anaiv.fluxogestao.repository.MotoristaRepository;
import org.springframework.stereotype.Service;

@Service
public class MotoristaPortoResolver {
    private final MotoristaRepository motoristas;
    public MotoristaPortoResolver(MotoristaRepository motoristas){this.motoristas=motoristas;}

    /**
     * A associacao e feita exclusivamente pelo QRA. No relatorio da Porto o mesmo nome aparece com
     * QRAs diferentes (matricula e identificador interno) e cada QRA corresponde a uma pessoa
     * distinta, entao casar por nome fundiria cadastros que devem ficar separados. A OS cujo QRA nao
     * esta cadastrado fica sem socorrista e vira excecao para o operacional resolver.
     */
    public Motorista resolver(OrdemServicoPorto os){
        if(!preenchido(os.getQra()))return null;
        return motoristas.findByQraIgnoreCase(os.getQra().trim()).filter(Motorista::isAtivo).orElse(null);
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
