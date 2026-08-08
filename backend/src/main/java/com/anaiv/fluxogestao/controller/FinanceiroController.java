package com.anaiv.fluxogestao.controller;

import com.anaiv.fluxogestao.dto.FinanceiroDtos.*;
import com.anaiv.fluxogestao.entity.EnumsFinanceiros.StatusContaReceber;
import com.anaiv.fluxogestao.security.UsuarioPrincipal;
import com.anaiv.fluxogestao.service.*;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api")
public class FinanceiroController {
    private final FinanceiroService financeiro; private final DashboardService dashboard;
    public FinanceiroController(FinanceiroService f,DashboardService d){financeiro=f;dashboard=d;}

    @GetMapping("/contas-receber") @PreAuthorize("hasRole('ADMINISTRADOR')")
    public List<ContaResponse> contas(@RequestParam(required=false) StatusContaReceber status,@RequestParam(required=false) String pesquisa){return financeiro.listarContas(status,pesquisa);}
    @PostMapping("/contas-receber") @ResponseStatus(HttpStatus.CREATED) @PreAuthorize("hasRole('ADMINISTRADOR')")
    public ContaResponse conta(@Valid @RequestBody ContaRequest r){return financeiro.criarConta(r);}
    @PatchMapping("/contas-receber/{id}/receber") @PreAuthorize("hasRole('ADMINISTRADOR')")
    public ContaResponse receber(@PathVariable Long id,@Valid @RequestBody RecebimentoRequest r){return financeiro.receber(id,r);}
    @GetMapping("/receitas") @PreAuthorize("hasRole('ADMINISTRADOR')") public List<ReceitaResponse> receitas(){return financeiro.listarReceitas();}
    @PostMapping("/receitas") @ResponseStatus(HttpStatus.CREATED) @PreAuthorize("hasRole('ADMINISTRADOR')")
    public ReceitaResponse receita(@Valid @RequestBody ReceitaRequest r){return financeiro.criarReceita(r);}
    @PutMapping("/receitas/{id}") @PreAuthorize("hasRole('ADMINISTRADOR')") public ReceitaResponse atualizarReceita(@PathVariable Long id,@Valid @RequestBody ReceitaRequest r){return financeiro.atualizarReceita(id,r);}
    @DeleteMapping("/receitas/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) @PreAuthorize("hasRole('ADMINISTRADOR')") public void excluirReceita(@PathVariable Long id){financeiro.excluirReceita(id);}
    @GetMapping("/despesas") @PreAuthorize("hasRole('ADMINISTRADOR')") public List<DespesaResponse> despesas(){return financeiro.listarDespesas();}
    @PostMapping("/despesas") @ResponseStatus(HttpStatus.CREATED)
    public DespesaResponse despesa(@Valid @RequestBody DespesaRequest r,@AuthenticationPrincipal UsuarioPrincipal p){return financeiro.criarDespesa(r,p);}
    @PatchMapping("/despesas/{id}/aprovar") @PreAuthorize("hasRole('ADMINISTRADOR')")
    public DespesaResponse aprovar(@PathVariable Long id,@AuthenticationPrincipal UsuarioPrincipal p){return financeiro.aprovar(id,p);}
    @PatchMapping("/despesas/{id}/rejeitar") @PreAuthorize("hasRole('ADMINISTRADOR')")
    public DespesaResponse rejeitar(@PathVariable Long id,@AuthenticationPrincipal UsuarioPrincipal p){return financeiro.rejeitar(id,p);}
    @PatchMapping("/despesas/{id}/pagar") @PreAuthorize("hasRole('ADMINISTRADOR')")
    public DespesaResponse pagar(@PathVariable Long id,@Valid @RequestBody PagamentoDespesaRequest r){return financeiro.pagar(id,r);}

    @GetMapping("/lancamentos") @PreAuthorize("hasRole('ADMINISTRADOR')")
    public List<LancamentoFinanceiroResponse> lancamentos(
        @RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate inicio,
        @RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate fim){return financeiro.listarLancamentos(inicio,fim);}

    @GetMapping("/dashboard") @PreAuthorize("hasRole('ADMINISTRADOR')")
    public DashboardResponse dashboard(
        @RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate inicio,
        @RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate fim,
        @RequestParam(required=false) Long veiculoId,@RequestParam(required=false) Long motoristaId,
        @RequestParam(required=false) Long categoriaId,@RequestParam(required=false) String status,
        @RequestParam(required=false) Long contratanteId){
        return dashboard.dashboard(inicio,fim,veiculoId,motoristaId,categoriaId,status,contratanteId);
    }
}
