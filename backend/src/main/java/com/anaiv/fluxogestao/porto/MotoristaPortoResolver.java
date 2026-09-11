package com.anaiv.fluxogestao.porto;

import com.anaiv.fluxogestao.cadastro.Motorista;
import com.anaiv.fluxogestao.porto.OrdemServicoPorto;
import com.anaiv.fluxogestao.cadastro.MotoristaRepository;
import org.springframework.stereotype.Service;

@Service
public class MotoristaPortoResolver {
    private final MotoristaRepository motoristas;
    public MotoristaPortoResolver(MotoristaRepository motoristas){this.motoristas=motoristas;}

    /**
     * A associacao e feita exclusivamente pelo QRA, nunca pelo nome: no relatorio da Porto o mesmo
     * nome aparece com QRAs diferentes, e a equipe tem pessoas de nome quase igual (pai e filho),
     * entao casar por nome fundiria cadastros que sao pessoas distintas.
     *
     * QRA que nao esta cadastrado NAO vira socorrista novo. O relatorio da Porto as vezes traz no
     * lugar do QRA um identificador interno do sistema deles (ex.: "0033i00001vTCZhAAO"), e criar
     * cadastro a partir disso duplicava a mesma pessoa e dividia a comissao dela entre os dois
     * registros. A OS fica sem socorrista e entra na fila de "Associar socorrista" da tela de
     * Ordens de servico, onde a correcao e feita a mao - e o vinculo manual sobrevive a reimportacao.
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
