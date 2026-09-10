package com.anaiv.fluxogestao.porto;
import org.springframework.data.jpa.repository.JpaRepository; import java.util.Collection; import java.util.List;
public interface RegistroImportadoPortoRepository extends JpaRepository<RegistroImportadoPorto,Long>{List<RegistroImportadoPorto> findByHashRegistroIn(Collection<String> hashes);}
