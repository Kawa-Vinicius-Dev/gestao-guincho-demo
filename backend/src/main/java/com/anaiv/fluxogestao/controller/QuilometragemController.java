package com.anaiv.fluxogestao.controller;

import com.anaiv.fluxogestao.dto.FinanceiroDtos.*;
import com.anaiv.fluxogestao.service.QuilometragemService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/quilometragens")
public class QuilometragemController {
    private final QuilometragemService service;
    public QuilometragemController(QuilometragemService s){service=s;}
    @GetMapping public List<QuilometragemResponse> listar(){return service.listar();}
    @PostMapping @ResponseStatus(HttpStatus.CREATED) public QuilometragemResponse criar(@Valid @RequestBody QuilometragemRequest r){return service.criar(r);}
}
