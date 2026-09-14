# Importação e tratamento de OS Porto sem QRA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir concluir a importação e exportar OS da Porto mesmo quando o arquivo não possuir a coluna QRA, e tornar essas exceções fáceis de localizar e atribuir manualmente na tela de Ordens de serviço.

**Architecture:** O parser passará a reconhecer a lista de OS quando todos os campos operacionais existentes estiverem presentes, tratando QRA como coluna opcional. OS importadas sem QRA persistirão com `qra = null`, continuarão aptas à associação manual de motorista e poderão ser filtradas pelo novo parâmetro `semQra`, independente de já terem um responsável manual. A interface preservará o filtro amplo de OS sem socorrista, acrescentará o filtro preciso de OS sem QRA e mostrará um selo de exceção por linha.

**Tech Stack:** Java 21, Spring Boot, Spring MVC, JPA, JUnit 5, Apache POI, React 19, TypeScript, Vite, Vitest, Testing Library e MSW.

## Global Constraints

- Não alterar migrations nem inventar QRA: a ausência deve ser persistida como `null`.
- A falta de QRA não pode criar erro de prévia, bloquear confirmação nem impedir a exportação XLSX.
- Diferenciar visual e funcionalmente “sem QRA” de “QRA não cadastrado / sem socorrista”.
- Uma associação manual de motorista deve continuar sendo possível e preservada nas reimportações.
- Manter autorização administrativa já aplicada aos endpoints Porto.
- O filtro de exportação deve usar exatamente os mesmos parâmetros ativos da tela.

---

## File Structure

- Modify: `backend/src/main/java/com/anaiv/fluxogestao/service/PortoCsvParser.java` — reconhecer OS Porto sem cabeçalho QRA.
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/dto/PortoDtos.java` — expor `semQra` nos filtros de OS.
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/service/PortoService.java` — filtrar pela ausência persistida de QRA.
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/service/PortoDashboardService.java` — adaptar a construção do DTO de filtro à nova assinatura, sem levar o filtro específico ao dashboard.
- Modify: `backend/src/test/java/com/anaiv/fluxogestao/porto/PortoImportacaoExcecoesApiIntegrationTest.java` — cobrir importação e confirmação de arquivo cuja coluna QRA não existe.
- Modify: `backend/src/test/java/com/anaiv/fluxogestao/porto/PortoOrdemServicoSemSocorristaFiltroApiIntegrationTest.java` — provar que `semQra` não se confunde com `semSocorrista` e alcança qualquer período.
- Modify: `backend/src/test/java/com/anaiv/fluxogestao/porto/PortoRelatorioApiIntegrationTest.java` — verificar a planilha exportada apenas com OS sem QRA e seu motivo explícito.
- Modify: `frontend/src/pages/PortoOrdensServicoPage.tsx` — oferecer filtro, exportação e destaque de OS sem QRA mantendo a associação manual existente.
- Modify: `frontend/src/styles.css` — dar ao selo de exceção contraste e leitura rápida sem competir com ações perigosas.
- Modify: `frontend/src/porto/PortoListagens.test.tsx` — testar o recorte `semQra`, o selo e a exportação correspondente.

## Interfaces

- Consumes: `GET /api/porto/ordens-servico` e `GET /api/porto/ordens-servico/excel` já recebem `@ModelAttribute PortoOsFiltros`.
- Produces: `GET /api/porto/ordens-servico?semQra=true` retorna apenas OS com `qra` nulo ou em branco; `GET /api/porto/ordens-servico/excel?semQra=true` exporta o mesmo conjunto.
- Produces: arquivos Porto com cabeçalhos `numero_os`, `valor_total`, `especialidade`, `sigla_viatura`, `socorrista` e `data_atendimento`, mas sem `qra`, são classificados como `OS_VINCULADAS` e depois como `SERVICOS_GERAIS` no fluxo de colagem/arquivo normal.
- Produces: a tela mostra o selo textual `Sem QRA` na própria linha, disponibiliza `Somente OS sem QRA` e mantém `Associar socorrista` como correção manual.

### Task 1: Aceitar e confirmar arquivos Porto sem a coluna QRA

**Files:**

- Modify: `backend/src/test/java/com/anaiv/fluxogestao/porto/PortoImportacaoExcecoesApiIntegrationTest.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/service/PortoCsvParser.java`

**Consumes:** O importador já permite valores QRA vazios por linha e `PortoService.motivoDaFaltaDeSocorrista(null)` já informa que o relatório veio sem QRA.

**Produces:** Um arquivo de OS que não tem a coluna QRA gera prévia válida, pode ser confirmado e cria OS sem vínculo automático.

- [ ] **Step 1: Escrever o teste de integração que reproduz o arquivo sem a coluna QRA**

  Adicionar a `PortoImportacaoExcecoesApiIntegrationTest` o método abaixo. O cabeçalho possui seis colunas e, deliberadamente, não contém `QRA`.

  ```java
  @Test void importaArquivoDeOsSemColunaQra() throws Exception {
      String token=login();
      long calendario=((Number)JsonPath.read(criar(token,"/api/porto/calendario",
          "{\"dataPagamento\":\"2072-10-16\",\"competenciaInicio\":\"2072-10-01\",\"competenciaFim\":\"2072-10-15\",\"descricao\":\"Ciclo sem QRA\",\"ativo\":true}"),"$.id")).longValue();
      MockMultipartFile arquivo=new MockMultipartFile("arquivo","sem-coluna-qra.tsv","text/plain",("""
          Número da Ordem de Serviço\tValor Total\tEspecialidade\tSigla da Viatura\tSocorrista\tData de atendimento
          OS-EXC-SEM-COLUNA-QRA\t300.00\tGUINCHO\t\tSOCORRISTA SEM QRA\t22/09/2072
          """).getBytes(StandardCharsets.UTF_8));

      String previa=mvc.perform(multipart("/api/porto/importacoes/previa").file(arquivo).header("Authorization","Bearer "+token))
          .andExpect(status().isCreated())
          .andExpect(jsonPath("$.tipo").value("SERVICOS_GERAIS"))
          .andExpect(jsonPath("$.linhas[0].acao").value("IMPORTAR"))
          .andReturn().getResponse().getContentAsString();
      assertThat((List<String>)JsonPath.read(previa,"$.osSemSocorrista")).containsExactly("OS-EXC-SEM-COLUNA-QRA");

      mvc.perform(post("/api/porto/importacoes/{id}/confirmar",((Number)JsonPath.read(previa,"$.id")).longValue())
              .header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON)
              .content("{\"numeroOrdemPagamento\":\"OP-SEM-COLUNA-QRA\",\"calendarioPagamentoId\":"+calendario+",\"confirmarDivergencias\":true,\"confirmarReassociacoes\":true}"))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.importados").value(1))
          .andExpect(jsonPath("$.osSemSocorrista[0]").value("OS-EXC-SEM-COLUNA-QRA"));
  }
  ```

- [ ] **Step 2: Executar o teste para confirmar a falha atual**

  Run: `./mvnw.cmd -Dtest=PortoImportacaoExcecoesApiIntegrationTest#importaArquivoDeOsSemColunaQra test`

  Expected: FAIL com `Não foi possível detectar um relatório Porto pelos cabeçalhos.`, pois `detectar` ainda exige `qra`.

- [ ] **Step 3: Tornar QRA um cabeçalho opcional somente para a lista de OS**

  Em `PortoCsvParser.detectar`, substituir o conjunto obrigatório de `OS_VINCULADAS` por este conjunto. Manter `sigla_viatura` e `socorrista` obrigatórios preserva a diferenciação para relatórios de devolução, que não possuem esses campos.

  ```java
  if(h.containsAll(Set.of(
      "numero_os","valor_total","especialidade","sigla_viatura","socorrista","data_atendimento"
  ))) return TipoRelatorioPorto.OS_VINCULADAS;
  ```

  Não adicionar `qra` artificialmente ao mapa. Como `LinhaPorto.texto("qra")` devolve `null` quando a chave não existe, a OS será gravada com QRA nulo e aparecerá nas regras de exceção já existentes.

- [ ] **Step 4: Executar o teste de importação novamente**

  Run: `./mvnw.cmd -Dtest=PortoImportacaoExcecoesApiIntegrationTest#importaArquivoDeOsSemColunaQra test`

  Expected: PASS; a prévia e a confirmação retornam a OS sem QRA sem linhas de erro.

- [ ] **Step 5: Commit**

  ```bash
  git add backend/src/main/java/com/anaiv/fluxogestao/service/PortoCsvParser.java backend/src/test/java/com/anaiv/fluxogestao/porto/PortoImportacaoExcecoesApiIntegrationTest.java
  git commit -m "feat: accept Porto OS files without QRA column"
  ```

### Task 2: Criar filtro e exportação exatos para OS sem QRA

**Files:**

- Modify: `backend/src/test/java/com/anaiv/fluxogestao/porto/PortoOrdemServicoSemSocorristaFiltroApiIntegrationTest.java`
- Modify: `backend/src/test/java/com/anaiv/fluxogestao/porto/PortoRelatorioApiIntegrationTest.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/dto/PortoDtos.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/service/PortoService.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/service/PortoDashboardService.java`

**Consumes:** `PortoOsFiltros.semSocorrista` identifica vínculo de motorista ausente; `OrdemServicoResponse.qra` retém o QRA entregue pela Porto ou `null`.

**Produces:** `semQra` identifica a ausência de QRA no relatório, inclusive quando o operador posteriormente escolheu um motorista manualmente.

- [ ] **Step 1: Escrever o teste de filtro independente de vínculo**

  No teste de filtro existente, incluir uma OS sem QRA que já possui motorista e uma OS com QRA desconhecido. Consultar o novo parâmetro e verificar que apenas as OS sem QRA retornam.

  ```java
  inserir("OS-FILTRO-SEM-QRA-SEM-DONO","2077-04-13",null);
  jdbc.update("insert into ordens_servico_porto (numero,valor_total,especialidade,qra,data_atendimento,motorista_id) values (?,?,?,?,?,?)",
      "OS-FILTRO-SEM-QRA-COM-DONO",new BigDecimal("100.00"),"GUINCHO",null,Date.valueOf("2077-05-14"),motorista);
  jdbc.update("insert into ordens_servico_porto (numero,valor_total,especialidade,qra,data_atendimento) values (?,?,?,?,?)",
      "OS-FILTRO-QRA-DESCONHECIDO",new BigDecimal("100.00"),"GUINCHO","999999",Date.valueOf("2077-05-15"));

  List<String> semQra=JsonPath.read(listar(token,"semQra=true&numeroOs=OS-FILTRO"),"$[*].numero");
  assertThat(semQra).containsExactlyInAnyOrder("OS-FILTRO-SEM-QRA-SEM-DONO","OS-FILTRO-SEM-QRA-COM-DONO");
  ```

  Atualizar `limpar()` para excluir as novas OS de teste por prefixo já usado e não apagar o motorista antes do teste terminar.

- [ ] **Step 2: Executar o teste para confirmar que o parâmetro ainda é ignorado**

  Run: `./mvnw.cmd -Dtest=PortoOrdemServicoSemSocorristaFiltroApiIntegrationTest#filtraAsOsSemSocorristaEmQualquerMes test`

  Expected: FAIL porque `semQra=true` ainda devolve também a OS com QRA desconhecido e as demais OS do prefixo.

- [ ] **Step 3: Adicionar `semQra` ao DTO e aplicar o predicado no serviço**

  Acrescentar `Boolean semQra` após `semSocorrista` em `PortoDtos.PortoOsFiltros`:

  ```java
  public record PortoOsFiltros(LocalDate dataInicio,LocalDate dataFim,String numeroOs,String numeroOp,String especialidade,
      String socorrista,String qra,String viatura,StatusOperacionalPorto statusOperacional,StatusFinanceiroPorto statusFinanceiro,
      StatusConciliacaoPorto statusConciliacao,Boolean porDataPagamento,Boolean semSocorrista,Boolean semQra) {}
  ```

  Atualizar cada construção do record para fornecer o décimo quarto argumento `null`, inclusive em `PortoService.listarOss()` e em `PortoDashboardService.dashboard()`.

  Em `PortoService.filtrarOs`, inserir a condição após `semSocorrista`; ela trata valor ausente e valor apenas com espaços como ausência:

  ```java
  if(f.semQra()!=null&&f.semQra()!=(x.qra()==null||x.qra().isBlank()))return false;
  ```

  Não modificar `semSocorrista`: ele continua útil para tratar tanto QRA ausente quanto QRA não cadastrado.

- [ ] **Step 4: Estender a verificação da planilha exportada**

  Em `PortoRelatorioApiIntegrationTest`, criar uma OS sem QRA no arranjo de dados e solicitar `GET /api/porto/ordens-servico/excel?semQra=true`. Verificar que a lista contém somente a OS sem QRA, que a célula QRA está vazia e que a coluna de motivo informa o caso correto.

  ```java
  byte[] bytes=mvc.perform(get("/api/porto/ordens-servico/excel").param("semQra","true")
          .header("Authorization","Bearer "+token))
      .andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray();
  try(XSSFWorkbook workbook=new XSSFWorkbook(new ByteArrayInputStream(bytes))){
      var aba=workbook.getSheet("Ordens de serviço");
      var linhas=IntStream.range(1,aba.getLastRowNum()).mapToObj(aba::getRow).toList();
      assertThat(linhas).extracting(linha->texto(linha,0)).containsExactly("OS-EXP-SEM-QRA");
      assertThat(texto(linhas.getFirst(),4)).isEmpty();
      assertThat(texto(linhas.getFirst(),11)).isEqualTo("Relatório da Porto veio sem QRA nesta OS");
  }
  ```

- [ ] **Step 5: Executar testes do filtro e da exportação**

  Run: `./mvnw.cmd -Dtest=PortoOrdemServicoSemSocorristaFiltroApiIntegrationTest,PortoRelatorioApiIntegrationTest test`

  Expected: PASS; `semQra=true` não inclui OS com QRA desconhecido e o XLSX traz somente a exceção sem QRA com motivo legível.

- [ ] **Step 6: Commit**

  ```bash
  git add backend/src/main/java/com/anaiv/fluxogestao/dto/PortoDtos.java backend/src/main/java/com/anaiv/fluxogestao/service/PortoService.java backend/src/main/java/com/anaiv/fluxogestao/service/PortoDashboardService.java backend/src/test/java/com/anaiv/fluxogestao/porto/PortoOrdemServicoSemSocorristaFiltroApiIntegrationTest.java backend/src/test/java/com/anaiv/fluxogestao/porto/PortoRelatorioApiIntegrationTest.java
  git commit -m "feat: filter and export Porto OS without QRA"
  ```

### Task 3: Destacar e tratar OS sem QRA na tela de Ordens de serviço

**Files:**

- Modify: `frontend/src/porto/PortoListagens.test.tsx`
- Modify: `frontend/src/pages/PortoOrdensServicoPage.tsx`
- Modify: `frontend/src/styles.css`

**Consumes:** `semQra=true` filtra o endpoint e a associação manual existente usa `PATCH /api/porto/ordens-servico/{id}/motorista`.

**Produces:** O operador pode isolar e exportar a fila de exceções sem QRA, vê um selo de alto contraste em cada linha e pode abrir a associação manual já disponível para corrigir a responsabilidade.

- [ ] **Step 1: Escrever o teste de interface para filtro, destaque e exportação**

  Acrescentar em `PortoListagens.test.tsx` um teste MSW que responde a `semQra=true` somente com a OS sem QRA e captura a query da exportação:

  ```tsx
  test('destaca, filtra e exporta OS sem QRA',async()=>{
    const chamadas:string[]=[]
    servidor.use(
      http.get('/api/porto/ordens-servico',({request})=>{
        const url=new URL(request.url)
        return HttpResponse.json(url.searchParams.get('semQra')
          ? [{id:19,numero:'OS-SEM-QRA',valorTotal:300,dataAtendimento:'2026-07-02'}]
          : [{id:2,numero:'OS-COM-QRA',valorTotal:700,qra:'QRA-2',dataAtendimento:'2026-07-30'}])
      }),
      http.get('/api/porto/ordens-servico/excel',({request})=>{
        chamadas.push(new URL(request.url).search)
        return HttpResponse.text('planilha')
      }),
    )
    URL.createObjectURL=vi.fn(()=>'blob:teste');URL.revokeObjectURL=vi.fn();HTMLAnchorElement.prototype.click=vi.fn()
    const user=userEvent.setup();render(<PortoOrdensServicoPage/>)
    await screen.findByText('OS-COM-QRA')
    await user.click(screen.getByLabelText(/somente os sem qra/i))
    expect(await screen.findByText('OS-SEM-QRA')).toBeInTheDocument()
    expect(screen.getByText('Sem QRA')).toBeInTheDocument()
    expect(screen.getByRole('button',{name:/associar socorrista/i})).toBeInTheDocument()
    await user.click(screen.getByRole('button',{name:/exportar os sem qra/i}))
    await vi.waitFor(()=>expect(chamadas).toHaveLength(1))
    expect(chamadas[0]).toContain('semQra=true')
    expect(chamadas[0]).not.toContain('dataInicio')
  })
  ```

- [ ] **Step 2: Executar o teste para confirmar a falha atual**

  Run: `npm test -- --run frontend/src/porto/PortoListagens.test.tsx`

  Expected: FAIL porque não existe o controle “Somente OS sem QRA”, a query não contém `semQra` e não há selo exclusivo na linha.

- [ ] **Step 3: Implementar um estado e filtro específico, sem remover o filtro amplo atual**

  Em `PortoOrdensServicoPage.tsx`:

  ```tsx
  const [somenteSemQra,setSomenteSemQra]=useState(false)
  ```

  Criar `alternarSemQra(marcado:boolean)` seguindo a regra de `alternarOrfas`: copiar `parametros`, definir/remover `semQra`, remover `dataInicio` e `dataFim` ao marcar, limpar `periodo` quando necessário e chamar `carregar(params)`. O filtro de formulário `aplicar` deve preservar ambos os flags ativos:

  ```tsx
  if(somenteNaoIdentificados)params.set('semSocorrista','true')
  if(somenteSemQra)params.set('semQra','true')
  ```

  Ao lado do checkbox existente, inserir:

  ```tsx
  <label className="check-field">
    <input type="checkbox" checked={somenteSemQra} onChange={e=>void alternarSemQra(e.target.checked)}/>
    Somente OS sem QRA
  </label>
  ```

  Derivar o nome do botão sem estado adicional:

  ```tsx
  {somenteSemQra?'Exportar OS sem QRA':somenteNaoIdentificados?'Exportar OS sem socorrista':'Exportar Excel'}
  ```

  Na primeira célula da linha, exibir o aviso somente quando o valor estiver ausente:

  ```tsx
  <td><strong>{os.numero}</strong>{!os.qra?.trim()?<span className="porto-qra-ausente">Sem QRA</span>:null}</td>
  ```

  Manter o botão `Associar socorrista`; ele é a edição operacional correta para uma OS cuja Porto não forneceu QRA e preserva o vínculo manual em reimportações.

- [ ] **Step 4: Estilizar o selo como uma exceção operacional, não como erro de formulário**

  Em `styles.css`, adicionar junto aos estilos Porto:

  ```css
  .porto-qra-ausente{display:block;width:max-content;margin-top:5px;padding:3px 6px;border:1px solid #f3c670;border-radius:4px;color:#8a4b00;background:#fff7df;font:600 8px 'IBM Plex Mono',monospace;letter-spacing:.04em;text-transform:uppercase}
  ```

  O tom âmbar comunica pendência tratável, enquanto o vermelho continua reservado para a ação destrutiva `table-action-danger` já existente.

- [ ] **Step 5: Executar o teste da tela e a verificação de tipos/build**

  Run: `npm test -- --run frontend/src/porto/PortoListagens.test.tsx`

  Expected: PASS; a caixa de seleção chama o endpoint com `semQra=true`, exibe o selo e a exportação conserva o filtro.

  Run: `npm run build`

  Expected: PASS; TypeScript conclui sem erro e Vite gera os artefatos de produção.

- [ ] **Step 6: Commit**

  ```bash
  git add frontend/src/pages/PortoOrdensServicoPage.tsx frontend/src/styles.css frontend/src/porto/PortoListagens.test.tsx
  git commit -m "feat: highlight Porto OS without QRA"
  ```

## Self-Review

1. **Spec coverage:** Task 1 remove o bloqueio de importação quando o cabeçalho QRA não vem; Task 2 garante que o filtro chega à exportação e separa ausência de QRA de QRA não cadastrado; Task 3 torna a exceção identificável e mantém a correção manual na tela de OS.
2. **Placeholder scan:** não há marcadores de trabalho pendente, instruções genéricas de tratamento de erro ou passos sem conteúdo executável.
3. **Type consistency:** o nome de query é `semQra` em `PortoOsFiltros`, `PortoService`, frontend e testes; o valor booleano interpreta QRA nulo/em branco, e a associação manual continua usando `motoristaId`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-09-porto-os-sem-qra.md`. Two execution options:

1. **Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
