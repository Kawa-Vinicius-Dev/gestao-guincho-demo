# Confirmação Porto por número da OP — plano de implementação

**Objetivo:** permitir que o administrador informe diretamente o número da OP paga e o período financeiro na confirmação de uma importação Porto, com prévia segura, criação/reutilização automática, confirmações explícitas e sincronização idempotente.

**Arquitetura:** manter `PortoImportacaoService` como orquestrador transacional, ampliar o contrato de prévia com uma análise de OP por número e concentrar criação, associação e recálculo em operações de domínio Porto. Reutilizar `PortoFinanceiroService` para atualizar as entidades financeiras únicas por OS e conservar os dashboards/comissões como consumidores dos dados oficiais.

## 1. Especificar o contrato e a criação idempotente da OP

**Arquivos:**

- Alterar `backend/src/test/java/com/anaiv/fluxogestao/porto/PortoFluxoFinanceiroApiIntegrationTest.java`.
- Alterar `backend/src/main/java/com/anaiv/fluxogestao/dto/PortoDtos.java`.
- Alterar `backend/src/main/java/com/anaiv/fluxogestao/service/PortoImportacaoService.java`.
- Alterar `backend/src/main/java/com/anaiv/fluxogestao/service/PortoService.java`.

**Passos:**

1. Escrever teste que envia `SERVICOS_GERAIS`, avalia por `numeroOrdemPagamento`, confirma com número/período e verifica criação da OP, vínculo das OS, recebimento, dashboards, comissão e ausência de duplicação na reimportação.
2. Executar apenas o teste e confirmar a falha pelo contrato ainda baseado em ID.
3. Ampliar o request com `numeroOrdemPagamento` e confirmações separadas, preservando `ordemPagamentoId` para os fluxos existentes.
4. Criar a resposta de análise contendo existência da OP, valor atual, soma do arquivo, diferença e reassociações.
5. Implementar busca/criação por número dentro da confirmação e revalidação transacional.
6. Executar o teste focado até passar.

## 2. Especificar divergência financeira e reassociação

**Arquivos:**

- Alterar `backend/src/test/java/com/anaiv/fluxogestao/porto/PortoApiIntegrationTest.java`.
- Alterar `backend/src/test/java/com/anaiv/fluxogestao/porto/PortoFluxoFinanceiroApiIntegrationTest.java`.
- Alterar `backend/src/main/java/com/anaiv/fluxogestao/entity/OrdemPagamentoPorto.java`.
- Alterar `backend/src/main/java/com/anaiv/fluxogestao/service/PortoImportacaoService.java`.
- Alterar `backend/src/main/java/com/anaiv/fluxogestao/service/PortoService.java`.

**Passos:**

1. Escrever teste de prévia que verifica valor atual, soma do arquivo e diferença.
2. Escrever teste com OS ligada a outra OP que verifica número da OS, OP atual/nova, quantidade e valor total a mover.
3. Verificar que confirmar sem as autorizações não altera OP, OS, receita ou conta.
4. Implementar as validações separadas de divergência financeira e reassociação.
5. Após autorização, mover a OS, recalcular destino e origens e sincronizar os registros existentes por OS.
6. Verificar que as duas OPs e os registros financeiros ficam corretos e não duplicados.

## 3. Substituir o seletor na interface

**Arquivos:**

- Alterar `frontend/src/porto/PortoImportacoesPage.test.tsx`.
- Alterar `frontend/src/types/modelos.ts`.
- Alterar `frontend/src/api/porto.ts`.
- Alterar `frontend/src/pages/PortoImportacoesPage.tsx`.

**Passos:**

1. Atualizar os testes para exigir `Número da OP`, remover a dependência da listagem de OPs e validar que número/período controlam o botão.
2. Testar a exibição da divergência financeira e da lista/totais de reassociação, com confirmações separadas.
3. Executar o teste da página e confirmar a falha antes da implementação.
4. Alterar tipos e funções da API para avaliar/confirmar por número.
5. Implementar o campo de texto, invalidar prévia/autorização quando número ou período mudar e renderizar os detalhes retornados pelo backend.
6. Executar novamente o teste focado.

## 4. Regressão e documentação operacional

**Arquivos:**

- Alterar somente se necessário `docs/porto-fluxo-ops-e-pagamentos.md`.
- Ajustar testes Porto existentes apenas para compatibilidade legítima do contrato.

**Passos:**

1. Rodar todos os testes backend e corrigir apenas regressões do fluxo alterado.
2. Rodar package do backend.
3. Rodar todos os testes, lint e build do frontend.
4. Rodar `git diff --check` e revisar o diff por arquivos fora do escopo.

## 5. Integrar e publicar com segurança

1. Commitar a implementação na branch `codex/porto-op-number`.
2. Atualizar referências remotas e garantir que a `main` não divergiu.
3. Integrar por fast-forward quando possível, sem force-push.
4. Repetir na `main`: testes e package backend, testes/lint/build frontend e `git diff --check`.
5. Se tudo estiver verde, executar `git push origin main` e confirmar igualdade entre `main` e `origin/main`.
6. Não fazer deploy e não remover os worktrees de segurança.
