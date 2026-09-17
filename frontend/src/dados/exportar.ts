import { data, moeda } from '../utils/formatadores'

/**
 * Relatorios em Excel (.xlsx) e PDF, com a mesma organizacao nos dois.
 *
 * Kawa pediu DRE, relatorios e importacoes "mais organizados" que o CSV cru:
 * titulo, periodo, um resumo no topo, cabecalho destacado, valores em reais com
 * formato de moeda de verdade (soma e ordena no Excel), linha de total e
 * numeracao de pagina no PDF.
 *
 * As bibliotecas sao carregadas so no clique de exportar: quem nunca exporta
 * nao paga o peso delas ao abrir o sistema.
 */

export type TipoColuna = 'texto' | 'moeda' | 'data' | 'numero' | 'percentual'
export type Celula = string | number | null | undefined

export interface ColunaRelatorio {
  titulo: string
  tipo?: TipoColuna
  /** Largura no Excel, em caracteres. */
  largura?: number
}

export interface Relatorio {
  titulo: string
  /** Normalmente o periodo: "Período: 01/09/2026 a 15/09/2026". */
  subtitulo?: string
  /** Pares rotulo/valor mostrados acima da tabela. */
  resumo?: [string, string][]
  colunas: ColunaRelatorio[]
  linhas: Celula[][]
  /** Linha de total, na mesma ordem das colunas; vazio onde nao ha total. */
  totais?: Celula[]
  /** Sem extensao. */
  nomeArquivo: string
}

const AZUL = '0F2A44'
const CINZA_CLARO = 'F2F5F9'

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
  const n = relatorio.colunas.length

  const tituloLinha = folha.addRow([relatorio.titulo])
  folha.mergeCells(tituloLinha.number, 1, tituloLinha.number, n)
  tituloLinha.font = { bold: true, size: 15, color: { argb: AZUL } }
  tituloLinha.height = 22
  const sub = folha.addRow([[relatorio.subtitulo, `Gerado em ${agora()}`].filter(Boolean).join(' · ')])
  folha.mergeCells(sub.number, 1, sub.number, n)
  sub.font = { size: 10, color: { argb: '5B6B7C' } }

  if (relatorio.resumo?.length) {
    folha.addRow([])
    for (const [rotulo, valor] of relatorio.resumo) {
      const linha = folha.addRow([rotulo, valor])
      linha.getCell(1).font = { color: { argb: '5B6B7C' } }
      linha.getCell(2).font = { bold: true }
    }
  }
  folha.addRow([])

  const cabecalho = folha.addRow(relatorio.colunas.map(c => c.titulo))
  cabecalho.eachCell(celula => {
    celula.font = { bold: true, color: { argb: 'FFFFFF' } }
    celula.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } }
    celula.alignment = { vertical: 'middle' }
  })
  cabecalho.height = 20
  const linhaCabecalho = cabecalho.number

  relatorio.linhas.forEach((valores, indice) => {
    const linha = folha.addRow(valores.map((v, i) =>
      relatorio.colunas[i]?.tipo === 'data' ? paraData(v) : v ?? ''))
    if (indice % 2 === 1) {
      linha.eachCell({ includeEmpty: true }, celula => {
        celula.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CINZA_CLARO } }
      })
    }
  })

  if (relatorio.totais) {
    const total = folha.addRow(relatorio.totais.map(v => v ?? ''))
    total.font = { bold: true }
    total.eachCell({ includeEmpty: true }, celula => {
      celula.border = { top: { style: 'medium', color: { argb: AZUL } } }
    })
  }

  relatorio.colunas.forEach((coluna, i) => {
    const col = folha.getColumn(i + 1)
    col.width = coluna.largura ?? Math.max(12, coluna.titulo.length + 4)
    const formato = coluna.tipo === 'moeda' ? '"R$" #,##0.00'
      : coluna.tipo === 'data' ? 'dd/mm/yyyy'
      : coluna.tipo === 'numero' ? '#,##0'
      : coluna.tipo === 'percentual' ? '0.0"%"'
      : undefined
    if (formato) {
      col.eachCell({ includeEmpty: false }, (celula, linha) => {
        if (linha > linhaCabecalho) celula.numFmt = formato
      })
    }
  })

  folha.views = [{ state: 'frozen', ySplit: linhaCabecalho }]
  if (relatorio.linhas.length) {
    folha.autoFilter = { from: { row: linhaCabecalho, column: 1 }, to: { row: linhaCabecalho, column: n } }
  }

  return await livro.xlsx.writeBuffer() as ArrayBuffer
}

export async function baixarExcel(relatorio: Relatorio): Promise<void> {
  const buffer = await montarExcel(relatorio)
  baixarBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${relatorio.nomeArquivo}.xlsx`)
}

export async function baixarPdf(relatorio: Relatorio): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const deitado = relatorio.colunas.length > 5
  const doc = new jsPDF({ orientation: deitado ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' })
  const margem = 36
  let y = margem + 6

  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(15, 42, 68)
  doc.text(relatorio.titulo, margem, y)
  y += 16
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(91, 107, 124)
  doc.text([relatorio.subtitulo, `Gerado em ${agora()}`].filter(Boolean).join(' · '), margem, y)
  y += 14

  if (relatorio.resumo?.length) {
    y += 4
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

  autoTable(doc, {
    startY: y + 6,
    margin: { left: margem, right: margem, bottom: margem + 10 },
    head: [relatorio.colunas.map(c => c.titulo)],
    body: relatorio.linhas.map(l => l.map((v, i) => textoDaCelula(v, relatorio.colunas[i]?.tipo))),
    foot: relatorio.totais ? [relatorio.totais.map((v, i) => textoDaCelula(v, relatorio.colunas[i]?.tipo))] : undefined,
    showFoot: 'lastPage',
    styles: { fontSize: 8, cellPadding: 4, textColor: [20, 30, 40] },
    headStyles: { fillColor: [15, 42, 68], textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: [226, 232, 240], textColor: [15, 42, 68], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [242, 245, 249] },
    columnStyles: Object.fromEntries(relatorio.colunas.map((c, i) => [i, { halign: alinhar(c.tipo) }])),
  })

  const paginas = doc.getNumberOfPages()
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(120, 130, 140)
    const largura = doc.internal.pageSize.getWidth(), altura = doc.internal.pageSize.getHeight()
    doc.text('Fluxo de Gestão', margem, altura - 18)
    doc.text(`Página ${p} de ${paginas}`, largura - margem, altura - 18, { align: 'right' })
  }

  doc.save(`${relatorio.nomeArquivo}.pdf`)
}
