import { data, moeda } from '../utils/formatadores'

/**
 * Relatorios em Excel (.xlsx) e PDF, com a mesma organizacao nos dois.
 *
 * Kawa pediu DRE e relatorios "mais organizados" que o CSV cru: titulo, periodo,
 * um resumo no topo, tabelas com cabecalho destacado, valores em reais com
 * formato de moeda de verdade (soma e ordena no Excel), linha de total e
 * numeracao de pagina no PDF. Um relatorio pode ter varias tabelas (a DRE tem
 * despesas por categoria e resultado por viatura), uma abaixo da outra.
 *
 * As bibliotecas sao carregadas so no clique de exportar: quem nunca exporta
 * nao paga o peso delas ao abrir o sistema.
 */

export type TipoColuna = 'texto' | 'moeda' | 'data' | 'numero' | 'percentual'
export type Celula = string | number | null | undefined
export type Formato = 'excel' | 'pdf'

export interface ColunaRelatorio {
  titulo: string
  tipo?: TipoColuna
  /** Largura no Excel, em caracteres. */
  largura?: number
}

export interface SecaoRelatorio {
  titulo?: string
  colunas: ColunaRelatorio[]
  linhas: Celula[][]
  /** Linha de total, na mesma ordem das colunas; vazio onde nao ha total. */
  totais?: Celula[]
  /** Frase mostrada no lugar da tabela quando nao ha linhas. */
  vazio?: string
}

export interface Relatorio {
  titulo: string
  /** Normalmente o periodo: "Período: 01/09/2026 a 15/09/2026". */
  subtitulo?: string
  /** Pares rotulo/valor mostrados acima das tabelas. */
  resumo?: [string, string][]
  secoes: SecaoRelatorio[]
  /** Sem extensao. */
  nomeArquivo: string
}

const AZUL = '0F2A44'
const CINZA_CLARO = 'F2F5F9'
const CINZA_TEXTO = '5B6B7C'

function paraData(valor: Celula): Date | Celula {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(valor)) return valor
  const [ano, mes, dia] = valor.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(ano, mes - 1, dia))
}

function textoDaCelula(valor: Celula, tipo: TipoColuna = 'texto'): string {
  if (valor === null || valor === undefined || valor === '') return ''
  if (tipo === 'moeda' && typeof valor === 'number') return moeda(valor)
  if (tipo === 'data' && typeof valor === 'string') return data(valor.slice(0, 10))
  if (tipo === 'percentual' && typeof valor === 'number') return `${valor.toFixed(1).replace('.', ',')}%`
  if (tipo === 'numero' && typeof valor === 'number') return valor.toLocaleString('pt-BR')
  return String(valor)
}

const formatoExcel = (tipo?: TipoColuna) =>
  tipo === 'moeda' ? '"R$" #,##0.00'
    : tipo === 'data' ? 'dd/mm/yyyy'
    : tipo === 'numero' ? '#,##0'
    : tipo === 'percentual' ? '0.0"%"'
    : undefined

function baixarBlob(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = nome
  link.click()
  URL.revokeObjectURL(url)
}

const agora = () => new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

/** A planilha pronta, em bytes. Separada do download para poder ser conferida. */
export async function montarExcel(relatorio: Relatorio): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import('exceljs')
  const livro = new ExcelJS.Workbook()
  livro.creator = 'Fluxo de Gestão'
  const folha = livro.addWorksheet(relatorio.titulo.slice(0, 31).replace(/[\\/?*[\]:]/g, ' '))
  const largura = Math.max(2, ...relatorio.secoes.map(s => s.colunas.length))

  const tituloLinha = folha.addRow([relatorio.titulo])
  folha.mergeCells(tituloLinha.number, 1, tituloLinha.number, largura)
  tituloLinha.font = { bold: true, size: 15, color: { argb: AZUL } }
  tituloLinha.height = 22
  const sub = folha.addRow([[relatorio.subtitulo, `Gerado em ${agora()}`].filter(Boolean).join(' · ')])
  folha.mergeCells(sub.number, 1, sub.number, largura)
  sub.font = { size: 10, color: { argb: CINZA_TEXTO } }

  if (relatorio.resumo?.length) {
    folha.addRow([])
    for (const [rotulo, valor] of relatorio.resumo) {
      const linha = folha.addRow([rotulo, valor])
      linha.getCell(1).font = { color: { argb: CINZA_TEXTO } }
      linha.getCell(2).font = { bold: true }
    }
  }

  const larguras: number[] = []
  let primeiroCabecalho = 0

  for (const secao of relatorio.secoes) {
    folha.addRow([])
    if (secao.titulo) {
      const t = folha.addRow([secao.titulo])
      t.font = { bold: true, size: 12, color: { argb: AZUL } }
    }
    const cabecalho = folha.addRow(secao.colunas.map(c => c.titulo))
    cabecalho.eachCell(celula => {
      celula.font = { bold: true, color: { argb: 'FFFFFF' } }
      celula.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } }
      celula.alignment = { vertical: 'middle' }
    })
    cabecalho.height = 20
    if (!primeiroCabecalho) primeiroCabecalho = cabecalho.number

    if (!secao.linhas.length && secao.vazio) {
      folha.addRow([secao.vazio]).font = { italic: true, color: { argb: CINZA_TEXTO } }
    }

    secao.linhas.forEach((valores, indice) => {
      const linha = folha.addRow(valores.map((v, i) =>
        secao.colunas[i]?.tipo === 'data' ? paraData(v) : v ?? ''))
      secao.colunas.forEach((coluna, i) => {
        const formato = formatoExcel(coluna.tipo)
        if (formato) linha.getCell(i + 1).numFmt = formato
      })
      if (indice % 2 === 1) {
        for (let i = 1; i <= secao.colunas.length; i++) {
          linha.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CINZA_CLARO } }
        }
      }
    })

    if (secao.totais) {
      const total = folha.addRow(secao.totais.map(v => v ?? ''))
      total.font = { bold: true }
      secao.colunas.forEach((coluna, i) => {
        const celula = total.getCell(i + 1)
        celula.border = { top: { style: 'medium', color: { argb: AZUL } } }
        const formato = formatoExcel(coluna.tipo)
        if (formato) celula.numFmt = formato
      })
    }

    secao.colunas.forEach((coluna, i) => {
      larguras[i] = Math.max(larguras[i] ?? 12, coluna.largura ?? coluna.titulo.length + 4)
    })
  }

  larguras.forEach((l, i) => { folha.getColumn(i + 1).width = l })
  // Uma tabela so: cabecalho fixo ao rolar e filtro do Excel nas colunas.
  if (relatorio.secoes.length === 1 && primeiroCabecalho) {
    folha.views = [{ state: 'frozen', ySplit: primeiroCabecalho }]
    const unica = relatorio.secoes[0]
    if (unica.linhas.length) {
      folha.autoFilter = {
        from: { row: primeiroCabecalho, column: 1 },
        to: { row: primeiroCabecalho, column: unica.colunas.length },
      }
    }
  }

  return await livro.xlsx.writeBuffer() as ArrayBuffer
}

export async function baixarExcel(relatorio: Relatorio): Promise<void> {
  const buffer = await montarExcel(relatorio)
  baixarBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${relatorio.nomeArquivo}.xlsx`)
}

/** O PDF pronto, em bytes. Separado do download para poder ser conferido. */
export async function montarPdf(relatorio: Relatorio): Promise<ArrayBuffer> {
  const { jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const deitado = relatorio.secoes.some(s => s.colunas.length > 5)
  const doc = new jsPDF({ orientation: deitado ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' })
  const margem = 36
  const alturaPagina = doc.internal.pageSize.getHeight()
  let y = margem + 6

  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(15, 42, 68)
  doc.text(relatorio.titulo, margem, y)
  y += 16
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(91, 107, 124)
  doc.text([relatorio.subtitulo, `Gerado em ${agora()}`].filter(Boolean).join(' · '), margem, y)
  y += 14

  if (relatorio.resumo?.length) {
    y += 6
    doc.setFontSize(10)
    for (const [rotulo, valor] of relatorio.resumo) {
      doc.setTextColor(91, 107, 124); doc.setFont('helvetica', 'normal')
      doc.text(rotulo, margem, y)
      doc.setTextColor(20, 30, 40); doc.setFont('helvetica', 'bold')
      doc.text(valor, margem + 170, y)
      y += 14
    }
  }

  const alinhar = (tipo?: TipoColuna) =>
    tipo === 'moeda' || tipo === 'numero' || tipo === 'percentual' ? 'right' as const : 'left' as const

  for (const secao of relatorio.secoes) {
    y += 24
    // Titulo da secao nao fica sozinho no pe da pagina.
    if (y > alturaPagina - 90) { doc.addPage(); y = margem + 6 }
    if (secao.titulo) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(15, 42, 68)
      doc.text(secao.titulo, margem, y)
      y += 6
    }
    if (!secao.linhas.length && secao.vazio) {
      doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(91, 107, 124)
      doc.text(secao.vazio, margem, y + 12)
      y += 20
      continue
    }
    autoTable(doc, {
      startY: y + 4,
      margin: { left: margem, right: margem, bottom: margem + 10 },
      head: [secao.colunas.map(c => c.titulo)],
      body: secao.linhas.map(l => l.map((v, i) => textoDaCelula(v, secao.colunas[i]?.tipo))),
      foot: secao.totais ? [secao.totais.map((v, i) => textoDaCelula(v, secao.colunas[i]?.tipo))] : undefined,
      showFoot: 'lastPage',
      styles: { fontSize: 8, cellPadding: 4, textColor: [20, 30, 40] },
      headStyles: { fillColor: [15, 42, 68], textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [226, 232, 240], textColor: [15, 42, 68], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [242, 245, 249] },
      columnStyles: Object.fromEntries(secao.colunas.map((c, i) => [i, { halign: alinhar(c.tipo) }])),
      // Cabecalho e total seguem o alinhamento da coluna: valor a direita em toda a coluna.
      didParseCell: celula => { celula.cell.styles.halign = alinhar(secao.colunas[celula.column.index]?.tipo) },
    })
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
  }

  const paginas = doc.getNumberOfPages()
  const larguraPagina = doc.internal.pageSize.getWidth()
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(120, 130, 140)
    doc.text('Fluxo de Gestão', margem, alturaPagina - 18)
    doc.text(`Página ${p} de ${paginas}`, larguraPagina - margem, alturaPagina - 18, { align: 'right' })
  }

  return doc.output('arraybuffer')
}

export async function baixarPdf(relatorio: Relatorio): Promise<void> {
  const bytes = await montarPdf(relatorio)
  baixarBlob(new Blob([bytes], { type: 'application/pdf' }), `${relatorio.nomeArquivo}.pdf`)
}

export function baixarRelatorio(relatorio: Relatorio, formato: Formato): Promise<void> {
  return formato === 'excel' ? baixarExcel(relatorio) : baixarPdf(relatorio)
}
