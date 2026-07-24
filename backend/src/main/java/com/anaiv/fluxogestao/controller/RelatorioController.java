package com.anaiv.fluxogestao.controller;

import com.anaiv.fluxogestao.service.RelatorioService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;

@RestController
@RequestMapping("/api/relatorios")
@PreAuthorize("hasRole('ADMINISTRADOR')")
public class RelatorioController {
    private final RelatorioService service;
    public RelatorioController(RelatorioService s){service=s;}
    @GetMapping("/{tipo}.csv")
    public ResponseEntity<byte[]> csv(@PathVariable String tipo,
        @RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate inicio,
        @RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate fim){
        byte[] conteudo=service.csv(tipo,inicio,fim).getBytes(StandardCharsets.UTF_8);
        return ResponseEntity.ok().header(HttpHeaders.CONTENT_DISPOSITION,"attachment; filename=\""+tipo+".csv\"")
            .contentType(new MediaType("text","csv",StandardCharsets.UTF_8)).body(conteudo);
    }
}
