package com.anaiv.fluxogestao.repository;
import com.anaiv.fluxogestao.entity.RegistroImportadoPorto; import org.springframework.data.jpa.repository.JpaRepository;
public interface RegistroImportadoPortoRepository extends JpaRepository<RegistroImportadoPorto,Long>{boolean existsByHashRegistro(String hash);}
