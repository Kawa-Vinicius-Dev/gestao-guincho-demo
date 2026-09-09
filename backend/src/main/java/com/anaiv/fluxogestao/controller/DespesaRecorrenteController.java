package com.anaiv.fluxogestao.controller;

import com.anaiv.fluxogestao.dto.FinanceiroDtos.*;
import com.anaiv.fluxogestao.security.UsuarioPrincipal;
import com.anaiv.fluxogestao.service.DespesaRecorrenteService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.YearMonth;
import java.util.List;

@RestController
@RequestMapping("/api/despesas-recorrentes")
@PreAuthorize("hasRole('ADMINISTRADOR')")
public class DespesaRecorrenteController {
    private final DespesaRecorrenteService service;
    public DespesaRecorrenteController(DespesaRecorrenteService service){this.service=service;}

    @GetMapping public List<DespesaRecorrenteResponse> listar(){return service.listar();}
    @PostMapping @ResponseStatus(HttpStatus.CREATED)
    public DespesaRecorrenteResponse criar(@Valid @RequestBody DespesaRecorrenteRequest r){return service.criar(r);}
    @PutMapping("/{id}") public DespesaRecorrenteResponse atualizar(@PathVariable Long id,@Valid @RequestBody DespesaRecorrenteRequest r){return service.atualizar(id,r);}
    @PatchMapping("/{id}/desativar") public DespesaRecorrenteResponse desativar(@PathVariable Long id){return service.desativar(id);}
    @PatchMapping("/{id}/reativar") public DespesaRecorrenteResponse reativar(@PathVariable Long id){return service.reativar(id);}
    @PostMapping("/lancamentos") @ResponseStatus(HttpStatus.CREATED)
    public LancamentoRecorrenteResponse lancar(@RequestParam String mes,@AuthenticationPrincipal UsuarioPrincipal principal){
        return service.lancar(YearMonth.parse(mes),principal);
    }
}
