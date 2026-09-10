package com.anaiv.fluxogestao.backup;

import com.anaiv.fluxogestao.backup.BackupService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;

@RestController
@RequestMapping("/api/backup")
@PreAuthorize("hasRole('ADMINISTRADOR')")
public class BackupController {
    private final BackupService backup;
    public BackupController(BackupService backup){this.backup=backup;}

    @GetMapping("/excel") public ResponseEntity<byte[]> excel(){
        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_DISPOSITION,"attachment; filename=copia-jms-"+LocalDate.now()+".xlsx")
            .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
            .body(backup.excel());
    }
}
