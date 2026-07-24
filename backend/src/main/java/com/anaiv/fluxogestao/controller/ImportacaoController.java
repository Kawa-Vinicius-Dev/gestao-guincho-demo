package com.anaiv.fluxogestao.controller;

import com.anaiv.fluxogestao.dto.ImportacaoDtos.*;
import com.anaiv.fluxogestao.service.ImportacaoService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import java.util.List;

@RestController
@RequestMapping("/api/importacoes")
@PreAuthorize("hasRole('ADMINISTRADOR')")
public class ImportacaoController {
    private final ImportacaoService service;
    public ImportacaoController(ImportacaoService s){service=s;}
    @GetMapping public List<ImportacaoResponse> listar(){return service.listar();}
    @PostMapping(consumes="multipart/form-data") @ResponseStatus(HttpStatus.CREATED)
    public ImportacaoResponse importar(@RequestPart("arquivo") MultipartFile arquivo){return service.importar(arquivo);}
    @PostMapping("/{id}/itens") @ResponseStatus(HttpStatus.CREATED)
    public ImportacaoResponse item(@PathVariable Long id,@Valid @RequestBody ItemRequest r){return service.adicionarItem(id,r);}
    @PostMapping("/{id}/confirmar") public ImportacaoResponse confirmar(@PathVariable Long id,@Valid @RequestBody ConfirmarRequest r){return service.confirmar(id,r);}
    @PostMapping("/{id}/cancelar") public ImportacaoResponse cancelar(@PathVariable Long id){return service.cancelar(id);}
}
