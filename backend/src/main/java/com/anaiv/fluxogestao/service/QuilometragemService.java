package com.anaiv.fluxogestao.service;

import com.anaiv.fluxogestao.dto.FinanceiroDtos.*;
import com.anaiv.fluxogestao.entity.Quilometragem;
import com.anaiv.fluxogestao.repository.QuilometragemRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.util.List;

@Service
public class QuilometragemService {
    private final QuilometragemRepository repository; private final CadastroService cadastros;
    public QuilometragemService(QuilometragemRepository r,CadastroService c){repository=r;cadastros=c;}
    @Transactional public QuilometragemResponse criar(QuilometragemRequest r){
        BigDecimal total=r.hodometroFinal().subtract(r.hodometroInicial());
        if(total.signum()<0) throw new IllegalArgumentException("O hodômetro final não pode ser menor que o inicial.");
        if(r.quilometragemRemunerada().compareTo(total)>0&&!Boolean.TRUE.equals(r.confirmarExcesso()))
            throw new IllegalArgumentException("A quilometragem remunerada ultrapassa a total. Confirme o excesso para continuar.");
        if(repository.existsByDataAndVeiculoIdAndHodometroInicialAndHodometroFinal(r.data(),r.veiculoId(),r.hodometroInicial(),r.hodometroFinal()))
            throw new IllegalArgumentException("Já existe um registro com estes hodômetros para o veículo e a data.");
        var q=new Quilometragem(r.data(),cadastros.obterVeiculo(r.veiculoId()),cadastros.obterMotorista(r.motoristaId()),
            r.protocolo(),r.hodometroInicial(),r.hodometroFinal(),r.quilometragemRemunerada(),r.observacoes());
        return resposta(repository.save(q));
    }
    public List<QuilometragemResponse> listar(){return repository.findAll().stream().map(this::resposta).toList();}
    public List<Quilometragem> entidades(){return repository.findAll();}
    private QuilometragemResponse resposta(Quilometragem q){return new QuilometragemResponse(q.getId(),q.getData(),q.getVeiculo().getIdentificacao(),
        q.getMotorista()==null?null:q.getMotorista().getNome(),q.getProtocolo(),q.getHodometroInicial(),q.getHodometroFinal(),
        q.getQuilometragemTotal(),q.getQuilometragemRemunerada(),q.getKmMorto(),q.getCustoPorKm(),q.getCustoKmMorto(),q.getObservacoes());}
}
