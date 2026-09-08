package com.anaiv.fluxogestao.repository;
import com.anaiv.fluxogestao.entity.RegistroImportadoPorto; import org.springframework.data.jpa.repository.JpaRepository; import java.util.Collection; import java.util.List;
public interface RegistroImportadoPortoRepository extends JpaRepository<RegistroImportadoPorto,Long>{boolean existsByHashRegistro(String hash);List<RegistroImportadoPorto> findByHashRegistroIn(Collection<String> hashes);}
