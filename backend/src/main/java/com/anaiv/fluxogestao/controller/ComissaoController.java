package com.anaiv.fluxogestao.controller;

import com.anaiv.fluxogestao.dto.ComissaoDtos.*;
import com.anaiv.fluxogestao.dto.PortoDtos.CalendarioResponse;
import com.anaiv.fluxogestao.security.UsuarioPrincipal;
import com.anaiv.fluxogestao.service.ComissaoService;
import com.anaiv.fluxogestao.service.CalendarioPortoService;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.util.List;

@RestController
@RequestMapping("/api")
public class ComissaoController {
    private final ComissaoService comissoes;
    private final CalendarioPortoService calendarios;
    public ComissaoController(ComissaoService comissoes,CalendarioPortoService calendarios){this.comissoes=comissoes;this.calendarios=calendarios;}
    @PostMapping("/minha-comissao/alimentacoes") @ResponseStatus(HttpStatus.CREATED)
    public AlimentacaoResponse alimentar(@Valid @RequestBody AlimentacaoRequest request,@AuthenticationPrincipal UsuarioPrincipal principal){return comissoes.registrarAlimentacao(request,principal);}
    @GetMapping("/minha-comissao") public ComissaoResponse minha(@RequestParam Long calendarioPagamentoId,@AuthenticationPrincipal UsuarioPrincipal principal){return comissoes.minha(calendarioPagamentoId,principal);}
    @GetMapping("/comissoes/periodos") public List<CalendarioResponse> periodos(){return calendarios.listar();}
    @GetMapping("/comissoes/resumo") @PreAuthorize("hasRole('ADMINISTRADOR')") public List<ResumoComissaoResponse> resumo(@RequestParam Long calendarioPagamentoId,@RequestParam(required=false) Long motoristaId){return comissoes.resumo(calendarioPagamentoId,motoristaId);}
    @GetMapping("/comissoes/{motoristaId}") @PreAuthorize("hasRole('ADMINISTRADOR')") public ComissaoResponse detalhe(@PathVariable Long motoristaId,@RequestParam Long calendarioPagamentoId){return comissoes.detalhe(calendarioPagamentoId,motoristaId);}
    @GetMapping("/comissoes/relatorio.csv") @PreAuthorize("hasRole('ADMINISTRADOR')") public ResponseEntity<byte[]> relatorio(@RequestParam Long calendarioPagamentoId){return ResponseEntity.ok().header(HttpHeaders.CONTENT_DISPOSITION,"attachment; filename=relatorio-comissoes.csv").contentType(new MediaType("text","csv",StandardCharsets.UTF_8)).body(comissoes.csv(calendarioPagamentoId).getBytes(StandardCharsets.UTF_8));}
}
