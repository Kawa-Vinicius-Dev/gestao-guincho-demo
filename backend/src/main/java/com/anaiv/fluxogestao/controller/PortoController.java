package com.anaiv.fluxogestao.controller;

import com.anaiv.fluxogestao.dto.PortoDtos.*;
import com.anaiv.fluxogestao.security.UsuarioPrincipal;
import com.anaiv.fluxogestao.service.*;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import java.util.List;
import java.util.Map;

@RestController @RequestMapping("/api/porto") @PreAuthorize("hasRole('ADMINISTRADOR')")
public class PortoController {
    private final PortoImportacaoService importacoes;private final PortoService porto;private final PortoRelatorioService relatorios;private final CalendarioPortoService calendario;private final PortoDashboardService dashboard;
    public PortoController(PortoImportacaoService i,PortoService p,PortoRelatorioService r,CalendarioPortoService calendario,PortoDashboardService dashboard){importacoes=i;porto=p;relatorios=r;this.calendario=calendario;this.dashboard=dashboard;}
    @PostMapping(value="/importacoes/previa",consumes="multipart/form-data") @ResponseStatus(HttpStatus.CREATED)
    public PreviaResponse previa(@RequestPart("arquivo")MultipartFile arquivo){return importacoes.previa(arquivo);}
    @PostMapping("/importacoes/previa-conteudo") @ResponseStatus(HttpStatus.CREATED)
    public PreviaResponse previaConteudo(@Valid @RequestBody ConteudoImportacaoRequest request){return importacoes.previaConteudo(request);}
    @PostMapping(value="/ordens-pagamento/{id}/composicao/previa",consumes="multipart/form-data") @ResponseStatus(HttpStatus.CREATED)
    public PreviaResponse previaComposicao(@PathVariable Long id,@RequestPart("arquivo") MultipartFile arquivo){return importacoes.previaComposicao(id,arquivo);}
    @PostMapping("/importacoes/{id}/avaliar") public PreviaResponse avaliar(@PathVariable Long id,@RequestBody ConfirmarImportacaoRequest request){return importacoes.avaliar(id,request);}
    @PostMapping("/importacoes/{id}/confirmar") public ConfirmacaoResponse confirmar(@PathVariable Long id,@RequestBody(required=false)ConfirmarImportacaoRequest request,@AuthenticationPrincipal UsuarioPrincipal principal){return importacoes.confirmar(id,request,principal);}
    @PostMapping("/importacoes/{id}/cancelar") public PreviaResponse cancelar(@PathVariable Long id){return importacoes.cancelar(id);}
    @GetMapping("/ordens-pagamento") public List<OrdemPagamentoResponse> ops(@ModelAttribute PortoFiltros filtros){return porto.listarOps(filtros);}
    @PostMapping("/ordens-pagamento") @ResponseStatus(HttpStatus.CREATED) public OrdemPagamentoResponse criarOp(@Valid @RequestBody OrdemPagamentoRequest request,@AuthenticationPrincipal UsuarioPrincipal principal){return porto.criarOpManual(request,principal);}
    @PutMapping("/ordens-pagamento/{id}") public OrdemPagamentoResponse atualizarOp(@PathVariable Long id,@Valid @RequestBody OrdemPagamentoRequest request,@AuthenticationPrincipal UsuarioPrincipal principal){return porto.atualizarOpManual(id,request,principal);}
    @GetMapping("/ordens-pagamento/resumo") public ResumoOrdensPagamentoResponse resumo(@ModelAttribute PortoFiltros filtros){return porto.resumo(filtros);}
    @GetMapping("/dashboard") public Map<String,Object> dashboard(@ModelAttribute PortoDashboardFiltros filtros){return dashboard.dashboard(filtros);}
    @GetMapping("/ordens-pagamento/{id}") public OrdemPagamentoDetalheResponse detalhe(@PathVariable Long id){return porto.detalhar(id);}
    @PostMapping("/ordens-pagamento/{id}/justificativas") @ResponseStatus(HttpStatus.CREATED)
    public JustificativaResponse justificar(@PathVariable Long id,@Valid @RequestBody JustificativaRequest request,@AuthenticationPrincipal UsuarioPrincipal principal){return porto.justificar(id,request,principal);}
    @GetMapping("/ordens-servico") public List<OrdemServicoResponse> oss(@ModelAttribute PortoOsFiltros filtros){return porto.listarOss(filtros);}
    @GetMapping("/pendencias") public List<PendenciaResponse> pendencias(){return porto.listarPendencias();}
    @PostMapping("/pendencias") @ResponseStatus(HttpStatus.CREATED) public PendenciaResponse criarPendencia(@Valid @RequestBody PendenciaRequest request){return porto.criarPendencia(request);}
    @PatchMapping("/pendencias/{id}/resolver") public PendenciaResponse resolverPendencia(@PathVariable Long id){return porto.resolverPendencia(id);}
    @PatchMapping("/ordens-pagamento/{id}/receber") public OrdemPagamentoResponse receber(@PathVariable Long id,@Valid @RequestBody RecebimentoRequest r){return porto.receber(id,r);}
    @GetMapping("/calendario") public List<CalendarioResponse> calendario(){return calendario.listar();}
    @PostMapping("/calendario") @ResponseStatus(HttpStatus.CREATED) public CalendarioResponse criarData(@Valid @RequestBody CalendarioRequest request){return calendario.criar(request);}
    @PutMapping("/calendario/{id}") public CalendarioResponse atualizarData(@PathVariable Long id,@Valid @RequestBody CalendarioRequest request){return calendario.atualizar(id,request);}
    @PatchMapping("/calendario/{id}/desativar") public CalendarioResponse desativarData(@PathVariable Long id){return calendario.desativar(id);}
    @GetMapping("/relatorios/excel") public ResponseEntity<byte[]> excel(@ModelAttribute PortoFiltros filtros,@ModelAttribute PortoOsFiltros filtrosOs){return ResponseEntity.ok().header(HttpHeaders.CONTENT_DISPOSITION,"attachment; filename=relatorio-porto.xlsx").contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).body(relatorios.excel(filtros,filtrosOs));}
    @GetMapping("/relatorios/pdf") public ResponseEntity<byte[]> pdf(@ModelAttribute PortoFiltros filtros,@ModelAttribute PortoOsFiltros filtrosOs){return ResponseEntity.ok().header(HttpHeaders.CONTENT_DISPOSITION,"attachment; filename=relatorio-porto.pdf").contentType(MediaType.APPLICATION_PDF).body(relatorios.pdf(filtros,filtrosOs));}
    @GetMapping("/ordens-pagamento/{id}/relatorios/excel") public ResponseEntity<byte[]> excelOp(@PathVariable Long id){return ResponseEntity.ok().header(HttpHeaders.CONTENT_DISPOSITION,"attachment; filename=op-porto.xlsx").contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).body(relatorios.excelOp(id));}
    @GetMapping("/ordens-pagamento/{id}/relatorios/pdf") public ResponseEntity<byte[]> pdfOp(@PathVariable Long id){return ResponseEntity.ok().header(HttpHeaders.CONTENT_DISPOSITION,"attachment; filename=op-porto.pdf").contentType(MediaType.APPLICATION_PDF).body(relatorios.pdfOp(id));}
}
