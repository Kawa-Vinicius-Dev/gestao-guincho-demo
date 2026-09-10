package com.anaiv.fluxogestao.financeiro;
import com.anaiv.fluxogestao.financeiro.Despesa;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import com.anaiv.fluxogestao.cadastro.Motorista;
import com.anaiv.fluxogestao.financeiro.EnumsFinanceiros.NaturezaDespesa;
public interface DespesaRepository extends JpaRepository<Despesa, Long> {
    List<Despesa> findByDataBetweenOrderByDataDesc(LocalDate inicio, LocalDate fim);
    @Query("select d from Despesa d where coalesce(d.dataPagamento,d.data) between :inicio and :fim")
    List<Despesa> findParaDashboardEntre(@Param("inicio") LocalDate inicio,@Param("fim") LocalDate fim);
    /** Superconjunto do periodo: o extrato usa o pagamento, senao o vencimento, senao o lancamento. */
    @Query("select d from Despesa d where d.dataPagamento between :inicio and :fim or d.vencimento between :inicio and :fim or d.data between :inicio and :fim")
    List<Despesa> findParaLancamentosEntre(@Param("inicio") LocalDate inicio,@Param("fim") LocalDate fim);
    /** Ja lancadas por molde no periodo: e o que impede lancar o mesmo mes duas vezes. */
    List<Despesa> findByDespesaRecorrenteIsNotNullAndVencimentoBetween(LocalDate inicio,LocalDate fim);
    List<Despesa> findByMotoristaAndNaturezaAndDataBetweenOrderByDataDesc(Motorista motorista,NaturezaDespesa natureza,LocalDate inicio,LocalDate fim);
    List<Despesa> findByMotoristaInAndNaturezaAndDataBetweenOrderByDataDesc(Collection<Motorista> motoristas,NaturezaDespesa natureza,LocalDate inicio,LocalDate fim);
}
