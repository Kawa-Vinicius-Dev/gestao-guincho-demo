package com.anaiv.fluxogestao.exception;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.dao.DataIntegrityViolationException;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(RecursoNaoEncontradoException.class)
    public ResponseEntity<ApiError> tratarNaoEncontrado(
            RecursoNaoEncontradoException exception,
            HttpServletRequest request
    ) {
        return resposta(HttpStatus.NOT_FOUND, "Recurso não encontrado", exception.getMessage(), request, Map.of());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiError> tratarValidacao(
            MethodArgumentNotValidException exception,
            HttpServletRequest request
    ) {
        Map<String, String> campos = new LinkedHashMap<>();
        exception.getBindingResult().getFieldErrors()
                .forEach(error -> campos.putIfAbsent(error.getField(), error.getDefaultMessage()));
        return resposta(HttpStatus.BAD_REQUEST, "Dados inválidos",
                "Revise os campos informados.", request, campos);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ApiError> tratarRegra(
            IllegalArgumentException exception,
            HttpServletRequest request
    ) {
        return resposta(HttpStatus.BAD_REQUEST, "Operação inválida", exception.getMessage(), request, Map.of());
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ApiError> tratarConflito(
            DataIntegrityViolationException exception,
            HttpServletRequest request
    ) {
        return resposta(HttpStatus.CONFLICT, "Registro duplicado",
                "Já existe um registro com os mesmos dados únicos.", request, Map.of());
    }

    private ResponseEntity<ApiError> resposta(
            HttpStatus status,
            String titulo,
            String detalhe,
            HttpServletRequest request,
            Map<String, String> campos
    ) {
        var erro = new ApiError(OffsetDateTime.now(), status.value(), titulo, detalhe,
                request.getRequestURI(), campos);
        return ResponseEntity.status(status).body(erro);
    }
}
