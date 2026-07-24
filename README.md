# Gestão Guincho — Demo

Sistema de gestão financeira pensado para empresas de guincho. A primeira versão organiza o que entra e sai da operação, dando ao gestor uma visão simples e confiável do caixa.

> Status: em desenvolvimento (demo de produto).

## Problema que o projeto resolve

Muitas operações pequenas acompanham o financeiro apenas pelo banco ou de memória. Isso dificulta saber quanto cada serviço rendeu, quais gastos pesam no mês e para onde o dinheiro está indo.

## Objetivo do MVP

Centralizar os registros financeiros e apresentar uma visão direta do negócio:

- Entradas por serviço, empresa/app contratante ou cliente;
- Saídas como combustível, manutenção, pedágio, alimentação e outros custos;
- Registro de custos relacionados ao **km morto**;
- Cadastro de veículos e funcionários;
- Dashboard com saldo, receitas, despesas e despesas por categoria;
- Importação futura de relatórios em PDF, CSV ou Excel de parceiros como a Porto Seguro.

## O que não faz parte da primeira versão

O foco inicial é o controle financeiro. Gestão de chamados, despacho e rastreamento em tempo real ficam para uma fase posterior, caso tragam valor para a operação.

## Fluxo principal

1. O gestor cadastra veículos, funcionários e categorias de gasto.
2. Registra uma entrada ou despesa da operação.
3. O sistema atualiza o saldo e os indicadores financeiros.
4. O gestor consulta o período e identifica custos, receitas e resultado.

## Próximas entregas

- [ ] Tela de login e acesso por usuário
- [ ] Dashboard financeiro
- [ ] Lançamento de entradas e despesas
- [ ] Cadastro de veículos e funcionários
- [ ] Cálculo e acompanhamento de km morto
- [ ] Relatórios por período, veículo e funcionário
- [ ] Importação de documentos de parceiros
- [ ] Versão mobile para lançamento de gastos por funcionários

## Organização do repositório

```text
gestao-guincho-demo/
├── docs/                 # Escopo, regras de negócio e decisões
├── src/                  # Código da aplicação (quando iniciado)
├── public/               # Arquivos públicos da interface
├── .github/              # Modelos de issues
└── README.md
```

## Documentação

- [Escopo do MVP](docs/escopo-mvp.md)
- [Regras de negócio iniciais](docs/regras-de-negocio.md)

## Autor

Desenvolvido por [Kawã Vinicius](https://github.com/Kawa-Vinicius-Dev) — ANAIV.
