# Padrões de tela

Este documento existe para que duas telas do mesmo sistema pareçam o mesmo
sistema. Antes, cada página montava o próprio cabeçalho e o próprio cartão, com
valores de espaçamento escolhidos na hora — e o resultado é um ritmo visual que
não bate, coisa que o olho percebe mesmo sem saber explicar.

## O equivalente a classe, aqui, é componente

No backend a forma de um objeto mora numa classe e cada uso a instancia. No
frontend a forma de um pedaço de tela mora num **componente**, e cada página o
usa passando os dados (as `props` fazem o papel do construtor). Não existe
herança no dia a dia: o que se usa é **composição** — um componente dentro do
outro.

As peças compartilhadas estão em `src/components/ui/Pagina.tsx`. Nenhuma delas
decide regra de negócio; são recipientes.

| Peça | Para quê |
| --- | --- |
| `CabecalhoPagina` | Módulo, título, descrição, uma linha de contexto e as ações da tela |
| `Painel` | Cartão branco com título e etiqueta. `semRespiro` para painel com tabela |
| `Indicador` + `GradeIndicadores` | Os números do topo, com tom semântico |
| `Etiqueta` | Marcador de estado dentro de tabela |

Exemplo, de uma tela real:

```tsx
<CabecalhoPagina
  modulo="Porto Seguro"
  titulo="Dashboard Porto"
  descricao="Serviços realizados, pagamentos programados e valores recebidos."
  contexto={<>Período: <strong>{data(inicio)}</strong> → <strong>{data(fim)}</strong></>}
  acoes={<button className="button button-primary">Exportar Excel</button>}/>
```

## Escalas

Espaço e tipografia saem de variáveis, nunca de um valor escolhido na hora.

- **Espaço:** `--espaco-1` (8px), `--espaco-2` (14px), `--espaco-3` (22px),
  `--espaco-4` (32px). Quatro degraus bastam; não existe nada entre eles.
- **Texto:** `--t-rotulo`, `--t-apoio`, `--t-corpo`, `--t-numero`,
  `--t-destaque`.
- **Número** é sempre `Barlow Condensed` com `font-variant-numeric: tabular-nums`,
  nos dois painéis — a fonte do número é parte da identidade.

Se aparecer a tentação de um quinto degrau de espaço, quase sempre o problema é
outro: agrupamento errado, ou informação demais no mesmo bloco.

## Cor carrega significado

Vermelho e amarelo **só entram quando há o que resolver**. "0 OPs com
divergência" é boa notícia e não pode parecer alarme — daí o `tom` do
`Indicador` receber `neutro` quando o número é zero. Verde é resultado positivo,
não enfeite.

## Como olhar a tela antes de dizer que terminou

Este é o ponto que mais custou caro: **desenhar sem ver o resultado não é
desenhar, é chutar**. As telas exigem login e dados reais, então existe uma
bancada visual que roda a página com respostas de exemplo, sem rede e sem banco:

```bash
cd frontend && npm run bancada
```

Depois abra `http://localhost:5173/bancada.html` (o painel Porto) ou
`bancada.html?tela=visao` (a Visão geral). Os dados de exemplo vivem em
`src/bancada.tsx`; para ver outro estado — período vazio, muitas pendências,
divergência — troque os números ali.

A bancada é ferramenta de desenvolvimento: fica fora do `index.html` e, portanto,
fora do que vai para produção.
