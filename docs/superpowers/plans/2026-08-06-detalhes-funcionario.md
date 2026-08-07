# Detalhes do Funcionário Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Disponibilizar uma ficha administrativa em `/equipe/:id` que combine cadastro, histórico operacional, comissão oficial e alimentação por período Porto.

**Architecture:** O backend expõe um contrato agregado administrativo no mesmo `ComissaoService` que já calcula comissão e alimentação. O resumo financeiro reutiliza diretamente `calcular`, enquanto a ampliação do histórico apenas une as OS pagas do fechamento às OS executadas na competência ainda sem pagamento, deduplicadas por ID. O frontend consome esse contrato e protege a rota com `RotaAdministrador`.

**Tech Stack:** Java 21, Spring Boot, Spring Security, JPA, H2/PostgreSQL, React 19, TypeScript, React Router, Vitest, Testing Library e MSW.

## Global Constraints

- Não criar uma segunda fonte de alimentação nem persistir total de comissão.
- Comissão bruta é produção efetivamente paga multiplicada por `20%`.
- Líquido é comissão bruta menos alimentação aprovada e pode ficar negativo.
- OS não paga aparece no histórico com comissão aguardando pagamento.
- Veículos são derivados da `sigla_viatura` das OS do período; não existe “veículo atual”.
- Somente `ADMINISTRADOR` acessa `/api/equipe/{id}/detalhes` e `/equipe/:id`.
- Não fazer commit, push ou deploy.

---

### Task 1: Contrato administrativo agregado

**Files:**
- Modify: `backend/src/test/java/com/anaiv/fluxogestao/comissao/ComissaoApiIntegrationTest.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/dto/ComissaoDtos.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/service/ComissaoService.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/controller/ComissaoController.java`

**Interfaces:**
- Consumes: `ComissaoService.calcular(Long, Motorista)` como única composição financeira oficial.
- Produces: `GET /api/equipe/{motoristaId}/detalhes?calendarioPagamentoId={id}` retornando cadastro, veículos, total de serviços, serviços e o objeto oficial `comissao`.

- [ ] **Step 1: Escrever teste de integração em RED**

```java
mvc.perform(get("/api/equipe/{id}/detalhes", motorista)
        .header("Authorization", "Bearer " + admin)
        .param("calendarioPagamentoId", String.valueOf(calendario)))
    .andExpect(status().isOk())
    .andExpect(jsonPath("$.totalServicosPrestados").value(2))
    .andExpect(jsonPath("$.comissao.quantidadeServicosPagos").value(1))
    .andExpect(jsonPath("$.comissao.comissaoBruta").value(100d))
    .andExpect(jsonPath("$.comissao.alimentacaoAprovada").value(30d))
    .andExpect(jsonPath("$.comissao.liquido").value(70d));
```

- [ ] **Step 2: Executar o teste e confirmar 404 por rota ausente**

Run: `./mvnw -Dtest=ComissaoApiIntegrationTest test`

- [ ] **Step 3: Implementar DTO, agregação e autorização mínima**

```java
@GetMapping("/equipe/{motoristaId}/detalhes")
@PreAuthorize("hasRole('ADMINISTRADOR')")
public DetalheFuncionarioResponse detalheFuncionario(@PathVariable Long motoristaId,
        @RequestParam Long calendarioPagamentoId) {
    return comissoes.detalheFuncionario(calendarioPagamentoId, motoristaId);
}
```

- [ ] **Step 4: Executar o teste até GREEN e comparar os totais com `/api/comissoes/{id}`**

Run: `./mvnw -Dtest=ComissaoApiIntegrationTest test`

### Task 2: Navegação e ficha administrativa React

**Files:**
- Create: `frontend/src/equipe/EquipeDetalhePage.test.tsx`
- Create: `frontend/src/pages/EquipeDetalhePage.tsx`
- Modify: `frontend/src/pages/EquipePage.tsx`
- Modify: `frontend/src/api/comissoes.ts`
- Modify: `frontend/src/types/modelos.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/styles.css`

**Interfaces:**
- Consumes: `obterDetalheFuncionario(motoristaId, calendarioPagamentoId): Promise<DetalheFuncionario>`.
- Produces: rota administrativa `/equipe/:id`, ação acessível `Ver detalhes`, seletor de período e seções de resumo, serviços e alimentação.

- [ ] **Step 1: Escrever teste React em RED para abrir a ficha pela listagem**

```tsx
await user.click(within(await screen.findByText('Ana Motorista').closest('article')!)
  .getByRole('link', { name: /ver detalhes/i }))
expect(await screen.findByRole('heading', { name: 'Ana Motorista' })).toBeInTheDocument()
expect(screen.getByText('OS-PENDENTE')).toHaveTextContent('OS-PENDENTE')
expect(screen.getByText(/aguardando pagamento/i)).toBeInTheDocument()
```

- [ ] **Step 2: Executar o teste e confirmar falha por ação/rota ausente**

Run: `npm test -- src/equipe/EquipeDetalhePage.test.tsx`

- [ ] **Step 3: Implementar listagem real, rota e página mínima**

```tsx
<Route path="/equipe/:id" element={<EquipeDetalhe/>}/>
```

- [ ] **Step 4: Testar troca para período anterior e bloqueio de funcionário comum**

Run: `npm test -- src/equipe/EquipeDetalhePage.test.tsx`

### Task 3: Verificação completa

**Files:**
- Review: todos os arquivos modificados nas Tasks 1 e 2.

- [ ] **Step 1: Executar backend completo**

Run: `./mvnw test`

- [ ] **Step 2: Empacotar backend**

Run: `./mvnw package`

- [ ] **Step 3: Executar frontend completo**

Run: `npm test`

- [ ] **Step 4: Executar lint e build frontend**

Run: `npm run lint` e `npm run build`

- [ ] **Step 5: Revisar integridade do diff sem criar commit**

Run: `git diff --check`, `git status --short --branch` e `git diff --stat`.
