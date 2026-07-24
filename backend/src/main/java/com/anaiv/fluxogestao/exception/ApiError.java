package com.anaiv.fluxogestao.exception;

import java.time.OffsetDateTime;
import java.util.Map;

public record ApiError(
        OffsetDateTime timestamp,
        int status,
        String titulo,
        String detalhe,
        String caminho,
        Map<String, String> campos
) {
}

