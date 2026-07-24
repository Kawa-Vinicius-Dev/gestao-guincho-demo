package com.anaiv.fluxogestao.controller;

import com.anaiv.fluxogestao.dto.CadastroDtos.*;
import com.anaiv.fluxogestao.entity.EnumsFinanceiros.TipoCategoria;
import com.anaiv.fluxogestao.service.CadastroService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api")
public class CadastroController {
    private final CadastroService service;
    public CadastroController(CadastroService service) { this.service=service; }

    @GetMapping("/veiculos") public List<VeiculoResponse> veiculos(){ return service.veiculos(); }
    @PostMapping("/veiculos") @ResponseStatus(HttpStatus.CREATED) @PreAuthorize("hasRole('ADMINISTRADOR')")
    public VeiculoResponse veiculo(@Valid @RequestBody VeiculoRequest r){ return service.criar(r); }
    @GetMapping("/contratantes") @PreAuthorize("hasRole('ADMINISTRADOR')") public List<ContratanteResponse> contratantes(){ return service.contratantes(); }
    @PostMapping("/contratantes") @ResponseStatus(HttpStatus.CREATED) @PreAuthorize("hasRole('ADMINISTRADOR')")
    public ContratanteResponse contratante(@Valid @RequestBody ContratanteRequest r){ return service.criar(r); }
    @GetMapping("/categorias") public List<CategoriaResponse> categorias(@RequestParam(required=false) TipoCategoria tipo){ return service.categorias(tipo); }
    @PostMapping("/categorias") @ResponseStatus(HttpStatus.CREATED) @PreAuthorize("hasRole('ADMINISTRADOR')")
    public CategoriaResponse categoria(@Valid @RequestBody CategoriaRequest r){ return service.criar(r); }
    @GetMapping("/motoristas") public List<MotoristaResponse> motoristas(){ return service.motoristas(); }
    @PostMapping("/motoristas") @ResponseStatus(HttpStatus.CREATED) @PreAuthorize("hasRole('ADMINISTRADOR')")
    public MotoristaResponse motorista(@Valid @RequestBody MotoristaRequest r){ return service.criar(r); }
    @GetMapping("/usuarios") @PreAuthorize("hasRole('ADMINISTRADOR')") public List<UsuarioResponse> usuarios(){ return service.usuarios(); }
    @PostMapping("/usuarios") @ResponseStatus(HttpStatus.CREATED) @PreAuthorize("hasRole('ADMINISTRADOR')")
    public UsuarioResponse usuario(@Valid @RequestBody UsuarioRequest r){ return service.criar(r); }
}
