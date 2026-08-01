package com.anaiv.fluxogestao.controller;

import com.anaiv.fluxogestao.dto.PortoDtos.*;
import com.anaiv.fluxogestao.security.UsuarioPrincipal;
import com.anaiv.fluxogestao.service.*;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import java.util.List;

@RestController @RequestMapping("/api/porto") @PreAuthorize("hasRole('ADMINISTRADOR')")
public class PortoController {
    private final PortoImportacaoService importacoes;private final PortoService porto;
    public PortoController(PortoImportacaoService i,PortoService p){importacoes=i;porto=p;}
    @PostMapping(value="/importacoes/previa",consumes="multipart/form-data") @ResponseStatus(HttpStatus.CREATED)
    public PreviaResponse previa(@RequestPart("arquivo")MultipartFile arquivo){return importacoes.previa(arquivo);}
    @PostMapping("/importacoes/previa-conteudo") @ResponseStatus(HttpStatus.CREATED)
    public PreviaResponse previaConteudo(@Valid @RequestBody ConteudoImportacaoRequest request){return importacoes.previaConteudo(request);}
    @PostMapping("/importacoes/{id}/avaliar") public PreviaResponse avaliar(@PathVariable Long id,@RequestBody ConfirmarImportacaoRequest request){return importacoes.avaliar(id,request);}
    @PostMapping("/importacoes/{id}/confirmar") public ConfirmacaoResponse confirmar(@PathVariable Long id,@RequestBody(required=false)ConfirmarImportacaoRequest request){return importacoes.confirmar(id,request);}
    @PostMapping("/importacoes/{id}/cancelar") public PreviaResponse cancelar(@PathVariable Long id){return importacoes.cancelar(id);}
    @GetMapping("/ordens-pagamento") public List<OrdemPagamentoResponse> ops(@ModelAttribute PortoFiltros filtros){return porto.listarOps(filtros);}
    @GetMapping("/ordens-pagamento/resumo") public ResumoOrdensPagamentoResponse resumo(@ModelAttribute PortoFiltros filtros){return porto.resumo(filtros);}
    @GetMapping("/dashboard") public ResumoOrdensPagamentoResponse dashboard(@ModelAttribute PortoFiltros filtros){return porto.resumo(filtros);}
    @GetMapping("/ordens-pagamento/{id}") public OrdemPagamentoDetalheResponse detalhe(@PathVariable Long id){return porto.detalhar(id);}
    @PostMapping("/ordens-pagamento/{id}/justificativas") @ResponseStatus(HttpStatus.CREATED)
    public JustificativaResponse justificar(@PathVariable Long id,@Valid @RequestBody JustificativaRequest request,@AuthenticationPrincipal UsuarioPrincipal principal){return porto.justificar(id,request,principal);}
    @GetMapping("/ordens-servico") public List<OrdemServicoResponse> oss(){return porto.listarOss();}
    @GetMapping("/pendencias") public List<PendenciaResponse> pendencias(){return porto.listarPendencias();}
    @PatchMapping("/ordens-pagamento/{id}/receber") public OrdemPagamentoResponse receber(@PathVariable Long id,@Valid @RequestBody RecebimentoRequest r){return porto.receber(id,r);}
}
