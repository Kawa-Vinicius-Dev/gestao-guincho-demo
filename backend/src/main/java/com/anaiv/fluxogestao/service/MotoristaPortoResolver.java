package com.anaiv.fluxogestao.service;

import com.anaiv.fluxogestao.entity.Motorista;
import com.anaiv.fluxogestao.entity.OrdemServicoPorto;
import com.anaiv.fluxogestao.repository.MotoristaRepository;
import org.springframework.stereotype.Service;

import java.text.Normalizer;
import java.util.List;
import java.util.Locale;

@Service
public class MotoristaPortoResolver {
    private final MotoristaRepository motoristas;
    public MotoristaPortoResolver(MotoristaRepository motoristas){this.motoristas=motoristas;}

    public Motorista resolver(OrdemServicoPorto os){
        if(preenchido(os.getQra())){
            var qra=motoristas.findByQraIgnoreCase(os.getQra().trim());
            if(qra.isPresent()&&qra.get().isAtivo())return qra.get();
        }
        if(!preenchido(os.getSocorrista()))return null;
        String procurado=normalizar(os.getSocorrista());
        List<Motorista> candidatos=motoristas.findAll().stream().filter(Motorista::isAtivo)
            .filter(m->normalizar(m.getNome()).equals(procurado)).toList();
        return candidatos.size()==1?candidatos.getFirst():null;
    }
    private String normalizar(String valor){return Normalizer.normalize(valor.trim(),Normalizer.Form.NFD)
        .replaceAll("\\p{M}+","").replaceAll("\\s+"," ").toLowerCase(Locale.ROOT);}
    private boolean preenchido(String valor){return valor!=null&&!valor.isBlank();}
}
