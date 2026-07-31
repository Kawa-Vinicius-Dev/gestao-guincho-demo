package com.anaiv.fluxogestao.controller;

import com.anaiv.fluxogestao.dto.PortoDtos.*;
import com.anaiv.fluxogestao.service.*;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import java.util.List;

@RestController @RequestMapping("/api/porto") @PreAuthorize("hasRole('ADMINISTRADOR')")
public class PortoController {
    private final PortoImportacaoService importacoes;private final PortoService porto;
    public PortoController(PortoImportacaoService i,PortoService p){importacoes=i;porto=p;}
    @PostMapping(value="/importacoes/previa",consumes="multipart/form-data") @ResponseStatus(HttpStatus.CREATED)
    public PreviaResponse previa(@RequestPart("arquivo")MultipartFile arquivo){return importacoes.previa(arquivo);}
    @PostMapping("/importacoes/{id}/confirmar") public ConfirmacaoResponse confirmar(@PathVariable Long id,@RequestBody(required=false)ConfirmarImportacaoRequest request){return importacoes.confirmar(id,request);}
    @GetMapping("/ordens-pagamento") public List<OrdemPagamentoResponse> ops(){return porto.listarOps();}
    @GetMapping("/ordens-servico") public List<OrdemServicoResponse> oss(){return porto.listarOss();}
    @GetMapping("/pendencias") public List<PendenciaResponse> pendencias(){return porto.listarPendencias();}
    @PatchMapping("/ordens-pagamento/{id}/receber") public OrdemPagamentoResponse receber(@PathVariable Long id,@Valid @RequestBody RecebimentoRequest r){return porto.receber(id,r);}
}
