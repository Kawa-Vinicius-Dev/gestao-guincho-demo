# OP, funcionário e cadastros operacionais Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** tornar QRA o identificador confiável do socorrista, preservar associação manual OP/OS–funcionário e permitir manter os cadastros de funcionários e viaturas completos e editáveis.

**Architecture:** `MotoristaPortoResolver` continuará priorizando QRA e só usará nome normalizado como fallback sem ambiguidade. A OS guarda o funcionário efetivamente associado e as receitas/comissões derivam desse vínculo. Perfis de funcionário e viatura passam a possuir os campos operacionais solicitados; a relação funcionário–viatura é uma associação com vigência, capaz de representar uma ou várias viaturas sem inferir o responsável de uma OS.

**Tech Stack:** Java 21, Spring Boot, JPA, Flyway, PostgreSQL, React, TypeScript, Vitest.

## Global Constraints

- Nome não é chave de negócio; QRA único, normalizado e não vazio é a primeira tentativa de identificação.
- Associação manual de uma OS prevalece sobre nova importação e nunca é removida por campo vazio.
- A especialidade pertence ao cadastro do funcionário; a OS conserva a especialidade recebida como histórico operacional.
- Dados já importados devem poder ser corrigidos sem duplicar OP, OS, conta, receita ou comissão.
- Não criar associação automática funcionário–viatura a partir de texto de viatura; ela é cadastro explícito.
- Usar os termos “funcionário” para o cadastro, “socorrista” para o papel na OS e “viatura” para o veículo operacional em toda a interface e documentação.

---

### Task 1: Expandir e editar o cadastro de funcionário

**Files:**
- Create: `backend/src/main/resources/db/migration/common/V13__cadastros_operacionais.sql`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/entity/Motorista.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/dto/CadastroDtos.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/service/CadastroService.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/controller/CadastroController.java`
- Modify: `frontend/src/types/modelos.ts`
- Modify: `frontend/src/pages/EquipePage.tsx`
- Test: `backend/src/test/java/com/anaiv/fluxogestao/comissao/ComissaoApiIntegrationTest.java`
- Test: `frontend/src/equipe/EquipeDetalhePage.test.tsx`

**Interfaces:**
- `MotoristaRequest(String nome,String telefone,String documento,String qra,String especialidade,Long usuarioId)`.
- `PUT /api/motoristas/{id}` updates name, phone, document, QRA and speciality; duplicate QRA returns 400.

- [ ] **Step 1: Add an API test for QRA normalization and editing**

```java
mvc.perform(put("/api/motoristas/{id}",motoristaId).header("Authorization","Bearer "+token)
    .contentType(APPLICATION_JSON)
    .content("""{"nome":"Ana","telefone":"81999999999","documento":null,"qra":" qra-85 ","especialidade":"Socorrista","usuarioId":null}"""))
  .andExpect(status().isOk()).andExpect(jsonPath("$.qra").value("QRA-85"))
  .andExpect(jsonPath("$.especialidade").value("Socorrista"));
```

- [ ] **Step 2: Run the focused test**

Run: `cd backend; .\mvnw.cmd -Dtest=ComissaoApiIntegrationTest test`

Expected: FAIL because the request and endpoint do not yet contain `especialidade` or `PUT`.

- [ ] **Step 3: Add the column and DTO/entity update method**

```sql
alter table motoristas add column especialidade text;
```

```java
public void atualizar(String nome,String telefone,String documento,String qra,String especialidade,Usuario usuario){
  this.nome=nome.trim(); this.telefone=limpar(telefone); this.documento=limpar(documento);
  this.qra=normalizarQra(qra); this.especialidade=limpar(especialidade); this.usuario=usuario;
}
```

- [ ] **Step 4: Enforce QRA uniqueness on create and update**

```java
motoristas.findByQraIgnoreCase(qra).filter(outro->!outro.getId().equals(id))
  .ifPresent(outro->{throw new IllegalArgumentException("Já existe um motorista com este QRA.");});
```

- [ ] **Step 5: Add edit action and specialty to the team UI; rerun tests**

Run: `cd frontend; npm test -- EquipeDetalhePage.test.tsx`

Expected: PASS; the card/details show QRA and specialty, and saving refreshes the edited record.

### Task 2: Modelar viaturas e o vínculo explícito com socorrista

**Files:**
- Modify: `backend/src/main/resources/db/migration/common/V13__cadastros_operacionais.sql`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/entity/Veiculo.java`
- Create: `backend/src/main/java/com/anaiv/fluxogestao/entity/MotoristaVeiculo.java`
- Create: `backend/src/main/java/com/anaiv/fluxogestao/repository/MotoristaVeiculoRepository.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/dto/CadastroDtos.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/service/CadastroService.java`
- Modify: `frontend/src/pages/FrotasPage.tsx`
- Test: `backend/src/test/java/com/anaiv/fluxogestao/financeiro/FluxoFinanceiroApiIntegrationTest.java`

**Interfaces:**
- `VeiculoRequest` gains `tipo`, `sigla`, `telefoneViatura`, `enderecoPartida`, `skillsEquipamentos` while `identificacao` remains the existing compatibility display field.
- `PUT /api/veiculos/{id}` updates a vehicle; `PUT /api/motoristas/{motoristaId}/viaturas` replaces only its explicit active links.

- [ ] **Step 1: Write a test that assigns two vehicles to one employee without duplicating either master record**

```java
mvc.perform(put("/api/motoristas/{id}/viaturas",motoristaId).header("Authorization","Bearer "+token)
    .contentType(APPLICATION_JSON).content("""{"veiculoIds":[1,2]}"""))
  .andExpect(status().isOk()).andExpect(jsonPath("$.viaturas.length()").value(2));
assertThat(jdbc.queryForObject("select count(*) from veiculos",Integer.class)).isEqualTo(2);
```

- [ ] **Step 2: Add the migration with master-data columns and a link table**

```sql
alter table veiculos add column tipo text;
alter table veiculos add column sigla text;
alter table veiculos add column telefone_viatura text;
alter table veiculos add column endereco_partida text;
alter table veiculos add column skills_equipamentos text;
create unique index veiculos_sigla_uk on veiculos(sigla) where sigla is not null;
create table motorista_veiculos (
  motorista_id bigint not null references motoristas(id), veiculo_id bigint not null references veiculos(id),
  ativo boolean not null default true, primary key (motorista_id,veiculo_id)
);
```

- [ ] **Step 3: Implement validation and replacement of the explicit links**

```java
if(new HashSet<>(request.veiculoIds()).size()!=request.veiculoIds().size())
  throw new IllegalArgumentException("Cada viatura pode ser informada uma única vez.");
vinculos.replaceActiveLinks(motorista,veiculos.findAllById(request.veiculoIds()));
```

- [ ] **Step 4: Extend the vehicle form with all fields and an edit action**

```tsx
<label className="field"><span>Tipo de veículo</span><input name="tipo" defaultValue={editando?.tipo}/></label>
<label className="field"><span>Sigla</span><input name="sigla" defaultValue={editando?.sigla}/></label>
<label className="field field-wide"><span>Skill / equipamentos</span><textarea name="skillsEquipamentos" defaultValue={editando?.skillsEquipamentos}/></label>
```

- [ ] **Step 5: Run database, frontend and accessibility regressions**

Run: `cd backend; .\mvnw.cmd test; cd ..\frontend; npm test; npm run build`

Expected: PASS; vehicles retain old `identificacao`/plate behavior and new operational fields after reload.

### Task 3: Make OP/OS association reviewable and QRA-first

**Files:**
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/service/MotoristaPortoResolver.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/service/PortoService.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/dto/PortoDtos.java`
- Modify: `frontend/src/pages/PortoOrdensServicoPage.tsx`
- Modify: `frontend/src/pages/EquipeDetalhePage.tsx`
- Test: `backend/src/test/java/com/anaiv/fluxogestao/porto/PortoFluxoFinanceiroApiIntegrationTest.java`
- Test: `frontend/src/porto/PortoListagens.test.tsx`

**Interfaces:**
- `OrdemServicoResponse` includes `motoristaEspecialidade`, `origemVinculoMotorista` (`QRA`, `NOME`, `MANUAL`, `NAO_IDENTIFICADO`) and the linked OP number.
- Manual association remains immutable during import unless an administrator explicitly changes it through the existing PATCH endpoint.

- [ ] **Step 1: Add a test proving QRA wins over a mismatched name**

```java
inserirMotorista("Maria Diferente","QRA-85");
importarOs("OS-QRA-1","Nome variável no arquivo","qra-85");
assertThat(buscarMotoristaDaOs("OS-QRA-1")).isEqualTo("Maria Diferente");
```

- [ ] **Step 2: Add a test proving ambiguous normalized names remain unassigned**

```java
inserirMotorista("João da Silva",null); inserirMotorista("Joao da Silva",null);
importarOs("OS-AMB-1","João da Silva",null);
assertThat(buscarMotoristaDaOs("OS-AMB-1")).isNull();
```

- [ ] **Step 3: Carry the association origin through the resolver and response**

```java
public record ResolucaoMotorista(Motorista motorista,OrigemVinculoMotorista origem) {}
// QRA => QRA; one normalized active name => NOME; otherwise null/NAO_IDENTIFICADO
```

Persist the origin on `ordens_servico_porto` in the same migration instead of inferring it later from text.

- [ ] **Step 4: Add filters and labels for unassigned/automatic/manual associations**

```tsx
<select name="origemVinculoMotorista"><option value="">Todos os vínculos</option><option value="NAO_IDENTIFICADO">Não identificados</option><option value="MANUAL">Manual</option></select>
```

- [ ] **Step 5: Verify income and commission after association correction**

Run: `cd backend; .\mvnw.cmd -Dtest=PortoFluxoFinanceiroApiIntegrationTest test`

Expected: association updates the OS and subsequent financial synchronization records the correct motorista without creating a second receita/conta; commission uses the selected OP calendar.

### Task 4: Avaliar e implementar uma importação controlada do cadastro Porto

**Files:**
- Create: `backend/src/main/java/com/anaiv/fluxogestao/service/PortoFuncionarioCsvParser.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/controller/CadastroController.java`
- Modify: `backend/src/main/java/com/anaiv/fluxogestao/service/CadastroService.java`
- Modify: `frontend/src/pages/EquipePage.tsx`
- Modify: `docs/porto-fluxo-ops-e-pagamentos.md`
- Test: `backend/src/test/java/com/anaiv/fluxogestao/porto/PortoCsvParserTest.java`
- Test: `frontend/src/equipe/EquipeDetalhePage.test.tsx`

**Interfaces:**
- `PortoFuncionarioCsvParser.LinhaFuncionarioPorto(String qra,String nome,String especialidade,String telefone,String siglaViatura,AcaoLinhaFuncionarioPorto acao,String erro)` is the preview row contract.
- `POST /api/motoristas/previa-importacao` accepts only CSV/TXT and returns rows classified as `CRIAR`, `ATUALIZAR`, `IGNORAR` or `ERRO`.
- `POST /api/motoristas/importar` accepts the preview id and explicit confirmation; QRA is mandatory for `CRIAR` and is the upsert key.

- [ ] **Step 1: Add a parser test based on the minimal operational file contract**

```text
QRA;Nome;Especialidade;Telefone;Sigla Viatura
QRA-85;Ana Silva;Socorrista;81999999999;K85
```

```java
assertThat(parser.parse(bytes).linhas()).extracting(PortoFuncionarioCsvParser.LinhaFuncionarioPorto::acao)
  .containsExactly(CRIAR);
```

- [ ] **Step 2: Reject unsafe rows before persistence**

```java
if(linha.qra()==null||linha.qra().isBlank())
  return linha.comErro("QRA é obrigatório para importar funcionário.");
if(existeQraComOutroDocumento(linha.qra(),linha.documento()))
  return linha.comErro("O QRA informado conflita com o cadastro existente.");
```

- [ ] **Step 3: Implement preview/confirm and show the field mapping in the UI**

```tsx
<p>O arquivo atualiza somente Nome, QRA, Especialidade, Telefone e vínculo sugerido de viatura. Nenhuma OS ou OP é alterada.</p>
<button disabled={temErros||confirmando} onClick={()=>void confirmarImportacaoFuncionarios()}>Confirmar cadastro</button>
```

- [ ] **Step 4: Update operation documentation and verify no automation is implied**

Run: `cd backend; .\mvnw.cmd -Dtest=PortoCsvParserTest test; cd ..\frontend; npm test -- EquipeDetalhePage.test.tsx`

Expected: PASS; this import only maintains the employee master data and future OP/OS association remains QRA-first/manual when missing.

### Task 5: Standardize OP/OS visual terminology and drill-down links

**Files:**
- Modify: `frontend/src/pages/PortoOrdensPagamentoPage.tsx`
- Modify: `frontend/src/pages/PortoOrdensServicoPage.tsx`
- Modify: `frontend/src/pages/EquipeDetalhePage.tsx`
- Modify: `docs/porto-fluxo-ops-e-pagamentos.md`
- Test: `frontend/src/porto/PortoListagens.test.tsx`

**Interfaces:**
- OS table labels use `Socorrista`, `QRA`, `Especialidade`, `Viatura`, `OP` and `Situação financeira` consistently.
- OP details link to their OS list; employee details link/filter to the same OS records rather than copying values into a separate editable view.

- [ ] **Step 1: Add UI assertions for consistent labels and an OP-to-OS drill-down link**

```ts
expect(screen.getByRole('columnheader',{name:'Socorrista / QRA'})).toBeInTheDocument()
expect(screen.getByRole('link',{name:/ver OS da OP 06422281/i})).toHaveAttribute('href',expect.stringContaining('numeroOp=06422281'))
```

- [ ] **Step 2: Replace mixed visible terminology without renaming persisted APIs**

```tsx
<span className="eyebrow">OP {op.numero}</span>
<h2>Ordens de serviço vinculadas</h2>
```

- [ ] **Step 3: Run the listing regression**

Run: `cd frontend; npm test -- PortoListagens.test.tsx`

Expected: PASS; the UI exposes the requested business vocabulary while backend compatibility names remain unchanged.
