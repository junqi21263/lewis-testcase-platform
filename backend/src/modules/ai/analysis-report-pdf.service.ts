import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import * as fs from 'fs'
import * as path from 'path'
import PDFDocument from 'pdfkit'
import { ExportAnalysisPdfDto } from './dto/export-analysis-pdf.dto'

/** 1 mm → PDF 点（1pt = 1/72 inch） */
const MM_TO_PT = 2.834645669
/** 上下左右边距 25mm —— 打印留白 */
const MARGIN_MM = 25
/** A4 宽度(pt)、高度(pt) —— pdfkit 默认 A4 */
const PAGE_W = 595.28
const PAGE_H = 841.89
/** 正文 13pt × 约 1.6 行距 */
const BODY_PT = 13
const LINE_GAP_BODY = Math.round(BODY_PT * 0.6)
/** 一级标题 20pt；二级 16pt；三级 14pt —— 与前端报告区层级对齐 */
const H1_PT = 20
const H2_PT = 16
const H3_PT = 14
/** 段落间距（8px 栅格 ≈ 6pt） */
const PARAGRAPH_GAP_PT = 6
/** 列表左侧缩进 */
const LIST_INDENT_PT = 15
/** 代码块字号 */
const CODE_PT = 10
/** 页眉页脚区预留高度，避免正文与页眉重叠 */
const HEADER_ZONE_PT = 38
const FOOTER_ZONE_PT = 34

/** 商务 PDF：白底 + 深色正文 + 蓝色层级点缀（与导出页 HTML 打印样式一致） */
const COLOR_BODY = '#0f172a'
const COLOR_H2 = '#0f172a'
const COLOR_H3 = '#1e293b'
const COLOR_MUTED = '#64748b'
const COLOR_TABLE_BORDER = '#334155'
const COLOR_TABLE_HEAD_BG = '#1e293b'
const COLOR_TABLE_ROW_A = '#0f172a'
const COLOR_TABLE_ROW_B = '#1e293b'
const COLOR_TABLE_CELL_TEXT = '#e2e8f0'
const COLOR_CODE_BG = '#f1f5f9'
const COLOR_ACCENT_BLUE = '#2563eb'
const MERMAID_IMAGE_MAX_BYTES = 5 * 1024 * 1024
const MERMAID_IMAGE_TOTAL_MAX_BYTES = 20 * 1024 * 1024

@Injectable()
export class AnalysisReportPdfService {
  private readonly logger = new Logger(AnalysisReportPdfService.name)

  /** 生成适合打印、分享的专业 PDF（白底、结构化排版） */
  async render(dto: ExportAnalysisPdfDto): Promise<Buffer> {
    this.validateMermaidImages(dto.mermaidImagesBase64 ?? [])
    const marginPt = MARGIN_MM * MM_TO_PT
    const contentWidth = PAGE_W - 2 * marginPt
    const contentTop = marginPt + HEADER_ZONE_PT
    const contentBottom = PAGE_H - marginPt - FOOTER_ZONE_PT

    const { bodyMarkdown, coverTitle } = this.extractTitleAndBody(
      dto.markdown,
      dto.documentTitle?.trim(),
    )
    const version = dto.version?.trim() || 'V1.0'
    const headerTitle = dto.documentTitle?.trim() || coverTitle

    /** 容器内由 Dockerfile 下载为 NotoSansSC-*.otf（源文件名为 NotoSansCJKsc-*）；勿使用 .ttc，pdfkit/fontkit 嵌入会失败 */
    const regular = this.resolveFontPath('REGULAR', [
      process.env.ANALYSIS_REPORT_PDF_FONT_REGULAR,
      process.env.ANALYSIS_REPORT_PDF_FONT_PATH,
      '/app/fonts/NotoSansSC-Regular.otf',
      path.join(process.cwd(), 'fonts', 'NotoSansSC-Regular.otf'),
      path.join(__dirname, '..', '..', '..', 'fonts', 'NotoSansSC-Regular.otf'),
    ])
    const bold = this.resolveFontPath('BOLD', [
      process.env.ANALYSIS_REPORT_PDF_FONT_BOLD,
      '/app/fonts/NotoSansSC-Bold.otf',
      path.join(process.cwd(), 'fonts', 'NotoSansSC-Bold.otf'),
      path.join(__dirname, '..', '..', '..', 'fonts', 'NotoSansSC-Bold.otf'),
    ])

    if (!regular) {
      this.logger.warn(
        '未找到思源黑体/Noto CJK 字体文件，中文可能显示异常。请在容器中挂载 /app/fonts/*.otf 或设置 ANALYSIS_REPORT_PDF_FONT_REGULAR。',
      )
    }

    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      bufferPages: true,
      info: { Title: coverTitle, Author: 'AI 需求分析平台' },
    })

    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))

    const endPromise = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)
    })

    let cursorY = contentTop

    const ensureSpace = (neededPt: number) => {
      if (cursorY + neededPt > contentBottom) {
        doc.addPage()
        cursorY = contentTop
      }
    }

    const setFont = (mode: 'regular' | 'bold', size: number) => {
      const fp = mode === 'bold' && bold ? bold : regular || bold || regular
      if (fp) {
        doc.font(fp).fontSize(size)
      } else {
        doc.font(mode === 'bold' ? 'Helvetica-Bold' : 'Helvetica').fontSize(size)
      }
    }

    // ── 封面主标题（居中、加粗、下蓝色分隔线 2pt）──
    setFont('bold', H1_PT)
    doc.fillColor('#000000')
    const titleHeight = doc.heightOfString(coverTitle, {
      width: contentWidth,
      align: 'center',
      lineGap: LINE_GAP_BODY,
    })
    ensureSpace(titleHeight + 16)
    doc.text(coverTitle, marginPt, cursorY, {
      width: contentWidth,
      align: 'center',
      lineGap: LINE_GAP_BODY,
    })
    cursorY += titleHeight + 6
    doc
      .strokeColor(COLOR_ACCENT_BLUE)
      .lineWidth(2)
      .moveTo(marginPt, cursorY)
      .lineTo(PAGE_W - marginPt, cursorY)
      .stroke()
    cursorY += 14

    // ── 正文：逐块解析 Markdown ──
    const mermaidImages = dto.mermaidImagesBase64 ?? []
    let mermaidIdx = 0

    const lines = bodyMarkdown.replace(/\r\n/g, '\n').split('\n')
    let i = 0
    let inFence = false
    let fenceBuf: string[] = []
    let fenceLang = ''

    while (i < lines.length) {
      const raw = lines[i]
      const line = raw ?? ''

      if (line.trim().startsWith('```')) {
        if (!inFence) {
          inFence = true
          fenceBuf = []
          fenceLang = line.trim().replace(/^```/, '').trim()
        } else {
          inFence = false
          const lang = fenceLang.toLowerCase()
          if (lang === 'mermaid' && mermaidImages[mermaidIdx]) {
            cursorY = this.drawMermaidImage(doc, mermaidImages[mermaidIdx], {
              marginPt,
              contentWidth,
              contentTop,
              contentBottom,
              cursorY,
            })
            mermaidIdx++
          } else {
            cursorY = this.flushCodeBlock(doc, {
              marginPt,
              contentWidth,
              contentTop,
              contentBottom,
              lines: fenceBuf,
              cursorY,
              setFont,
            })
          }
          fenceLang = ''
          fenceBuf = []
        }
        i++
        continue
      }

      if (inFence) {
        fenceBuf.push(line)
        i++
        continue
      }

      if (this.isTableHeaderRow(line, lines[i + 1])) {
        const { rows, consumed } = this.consumeTable(lines, i)
        cursorY = this.drawTable(doc, {
          rows,
          marginPt,
          contentWidth,
          contentTop,
          contentBottom,
          cursorY,
          setFont,
        })
        i += consumed
        continue
      }

      if (/^#{1,6}\s+/.test(line)) {
        const level = line.match(/^(#{1,6})\s/)?.[1]?.length ?? 1
        const text = line.replace(/^#{1,6}\s+/, '').trim()
        const cleaned = this.stripInlineMarkdown(text)
        if (level === 1) {
          setFont('bold', H1_PT)
          doc.fillColor('#000000')
          const h = doc.heightOfString(cleaned, { width: contentWidth, lineGap: LINE_GAP_BODY })
          ensureSpace(h + PARAGRAPH_GAP_PT + 6)
          doc.text(cleaned, marginPt, cursorY, { width: contentWidth, lineGap: LINE_GAP_BODY })
          cursorY += h + 4
          doc
            .strokeColor(COLOR_ACCENT_BLUE)
            .lineWidth(2)
            .moveTo(marginPt, cursorY)
            .lineTo(PAGE_W - marginPt, cursorY)
            .stroke()
          cursorY += PARAGRAPH_GAP_PT + 4
        } else if (level === 2) {
          const barW = 4
          const textX = marginPt + barW + 6
          const textW = contentWidth - barW - 6
          setFont('bold', H2_PT)
          doc.fillColor(COLOR_H2)
          const h = doc.heightOfString(cleaned, { width: textW, lineGap: LINE_GAP_BODY })
          ensureSpace(h + 10)
          doc.save()
          doc.rect(marginPt, cursorY, barW, h).fill(COLOR_ACCENT_BLUE)
          doc.restore()
          doc.text(cleaned, textX, cursorY, { width: textW, lineGap: LINE_GAP_BODY })
          cursorY += h + 10
        } else {
          setFont('bold', H3_PT)
          doc.fillColor(COLOR_H3)
          const h = doc.heightOfString(cleaned, { width: contentWidth, lineGap: LINE_GAP_BODY })
          ensureSpace(h + 8)
          doc.text(cleaned, marginPt, cursorY, { width: contentWidth, lineGap: LINE_GAP_BODY })
          cursorY += h + 8
        }
        doc.fillColor(COLOR_BODY)
        setFont('regular', BODY_PT)
        i++
        continue
      }

      if (/^\s*[-*+]\s+/.test(line)) {
        const item = line.replace(/^\s*[-*+]\s+/, '').trim()
        const cleaned = this.stripInlineMarkdown(item)
        setFont('regular', BODY_PT)
        doc.fillColor(COLOR_BODY)
        const bullet = '• '
        const indent = marginPt + LIST_INDENT_PT
        const w = contentWidth - LIST_INDENT_PT
        const block = bullet + cleaned
        const h = doc.heightOfString(block, { width: w, lineGap: LINE_GAP_BODY })
        ensureSpace(h + 6)
        doc.text(block, indent, cursorY, { width: w, lineGap: LINE_GAP_BODY })
        cursorY += h + 6
        i++
        continue
      }

      if (/^\s*\d+\.\s+/.test(line)) {
        const cleaned = this.stripInlineMarkdown(line.trim())
        setFont('regular', BODY_PT)
        doc.fillColor(COLOR_BODY)
        const indent = marginPt + LIST_INDENT_PT
        const w = contentWidth - LIST_INDENT_PT
        const h = doc.heightOfString(cleaned, { width: w, lineGap: LINE_GAP_BODY })
        ensureSpace(h + 6)
        doc.text(cleaned, indent, cursorY, { width: w, lineGap: LINE_GAP_BODY })
        cursorY += h + 6
        i++
        continue
      }

      if (line.trim() === '') {
        cursorY += PARAGRAPH_GAP_PT / 2
        i++
        continue
      }

      const paraLines: string[] = [line.trim()]
      let j = i + 1
      while (j < lines.length) {
        const next = lines[j]
        if (
          next.trim() === '' ||
          /^#{1,6}\s+/.test(next) ||
          this.isTableHeaderRow(next, lines[j + 1]) ||
          /^\s*[-*+]\s+/.test(next) ||
          /^\s*\d+\.\s+/.test(next) ||
          /^```/.test(next.trim())
        ) {
          break
        }
        paraLines.push(next.trim())
        j++
      }
      const para = this.stripInlineMarkdown(paraLines.join(' '))
      setFont('regular', BODY_PT)
      doc.fillColor(COLOR_BODY)
      const h = doc.heightOfString(para, { width: contentWidth, lineGap: LINE_GAP_BODY })
      ensureSpace(h + PARAGRAPH_GAP_PT)
      doc.text(para, marginPt, cursorY, {
        width: contentWidth,
        align: 'left',
        lineGap: LINE_GAP_BODY,
      })
      cursorY += h + PARAGRAPH_GAP_PT
      i = j
    }

    // ── 页眉页脚（每页）──
    const rng = doc.bufferedPageRange()
    const total = rng.count
    for (let p = 0; p < total; p++) {
      doc.switchToPage(rng.start + p)
      doc.save()
      setFont('regular', 10)
      doc.fillColor(COLOR_MUTED)
      const fp = regular
      if (fp) doc.font(fp)
      else doc.font('Helvetica')
      const headLeft = headerTitle.length > 48 ? `${headerTitle.slice(0, 46)}…` : headerTitle
      doc.text(headLeft, marginPt, marginPt, {
        width: contentWidth * 0.55,
        lineBreak: false,
      })
      doc.text(version, marginPt + contentWidth * 0.45, marginPt, {
        width: contentWidth * 0.55,
        align: 'right',
        lineBreak: false,
      })
      doc.text(`第 ${p + 1} 页 / 共 ${total} 页`, marginPt, PAGE_H - marginPt - 10, {
        width: contentWidth,
        align: 'center',
        lineBreak: false,
      })
      doc.restore()
    }

    doc.end()
    return endPromise
  }

  private normalizeBase64(input: string): string {
    return input.replace(/\s+/g, '')
  }

  private isLikelyBase64(raw: string): boolean {
    if (!raw || raw.length % 4 !== 0) return false
    return /^[A-Za-z0-9+/]+={0,2}$/.test(raw)
  }

  private validateMermaidImages(images: string[]) {
    let totalBytes = 0
    for (let i = 0; i < images.length; i++) {
      const normalized = this.normalizeBase64(images[i] || '')
      if (!this.isLikelyBase64(normalized)) {
        throw new BadRequestException(`第 ${i + 1} 张流程图图片格式非法，请重新导出后重试`)
      }
      let buf: Buffer
      try {
        buf = Buffer.from(normalized, 'base64')
      } catch {
        throw new BadRequestException(`第 ${i + 1} 张流程图图片格式非法，请重新导出后重试`)
      }
      if (buf.length < 24) {
        throw new BadRequestException(`第 ${i + 1} 张流程图图片内容无效，请重新导出后重试`)
      }
      if (buf.length > MERMAID_IMAGE_MAX_BYTES) {
        throw new BadRequestException('流程图图片过大，请减少图数量或压缩后重试')
      }
      totalBytes += buf.length
      if (totalBytes > MERMAID_IMAGE_TOTAL_MAX_BYTES) {
        throw new BadRequestException('流程图总大小过大，请减少图数量或压缩后重试')
      }
    }
  }

  private resolveFontPath(label: string, candidates: (string | undefined)[]): string | undefined {
    for (const c of candidates) {
      if (!c?.trim()) continue
      try {
        if (fs.existsSync(c)) {
          this.logger.debug(`PDF 字体(${label}): ${c}`)
          return c
        }
      } catch {
        /* ignore */
      }
    }
    return undefined
  }

  /** 确定封面标题并剥离正文首行 # 避免重复 */
  private extractTitleAndBody(
    markdown: string,
    explicitTitle?: string,
  ): { bodyMarkdown: string; coverTitle: string } {
    const md = markdown.replace(/\r\n/g, '\n').trim()
    if (explicitTitle) {
      return { bodyMarkdown: md, coverTitle: explicitTitle }
    }
    const firstLine = md.split('\n')[0] ?? ''
    const m = firstLine.match(/^#\s+(.+)/)
    if (m?.[1]) {
      const title = m[1].trim()
      const rest = md.slice(firstLine.length).replace(/^\n+/, '')
      return { bodyMarkdown: rest, coverTitle: title }
    }
    return { bodyMarkdown: md, coverTitle: 'AI 需求分析报告' }
  }

  private stripInlineMarkdown(s: string): string {
    return s
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  }

  private isTableHeaderRow(a: string, b?: string): boolean {
    if (!a.includes('|') || !b) return false
    return /^\s*\|[\s\-:|]+\|\s*$/.test(b)
  }

  private consumeTable(lines: string[], start: number): { rows: string[][]; consumed: number } {
    const rows: string[][] = []
    let i = start
    while (i < lines.length) {
      const ln = lines[i].trim()
      if (!ln.includes('|')) break
      if (/^\s*\|[\s\-:|]+\|\s*$/.test(ln)) {
        i++
        continue
      }
      rows.push(
        ln
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((c) => this.stripInlineMarkdown(c.trim())),
      )
      i++
    }
    return { rows, consumed: i - start }
  }

  private drawTable(
    doc: InstanceType<typeof PDFDocument>,
    opts: {
      rows: string[][]
      marginPt: number
      contentWidth: number
      contentTop: number
      contentBottom: number
      cursorY: number
      setFont: (m: 'regular' | 'bold', s: number) => void
    },
  ): number {
    const { rows, marginPt, contentWidth, contentTop, contentBottom } = opts
    let cursorY = opts.cursorY
    if (rows.length === 0) return cursorY

    const cols = Math.max(...rows.map((r) => r.length))
    const colW = contentWidth / cols
    const cellPad = 8
    const minRowHeight = BODY_PT * 1.5 + cellPad * 2

    const measureRowHeight = (cells: string[], header: boolean) => {
      opts.setFont(header ? 'bold' : 'regular', BODY_PT)
      let maxH = minRowHeight
      for (let c = 0; c < cols; c++) {
        const cell = cells[c] ?? ''
        const innerW = colW - cellPad * 2
        const h =
          doc.heightOfString(cell || ' ', { width: innerW, lineGap: 4 }) + cellPad * 2
        if (h > maxH) maxH = h
      }
      return maxH
    }

    const drawRow = (cells: string[], header: boolean, alt: boolean) => {
      const rowHeight = measureRowHeight(cells, header)
      if (cursorY + rowHeight > contentBottom - 4) {
        doc.addPage()
        cursorY = contentTop
      }
      const y0 = cursorY
      let x = marginPt
      for (let c = 0; c < cols; c++) {
        const cell = cells[c] ?? ''
        doc.save()
        if (header) {
          doc.rect(x, y0, colW, rowHeight).fill(COLOR_TABLE_HEAD_BG)
        } else {
          doc.rect(x, y0, colW, rowHeight).fill(alt ? COLOR_TABLE_ROW_B : COLOR_TABLE_ROW_A)
        }
        doc.strokeColor(COLOR_TABLE_BORDER).rect(x, y0, colW, rowHeight).stroke()
        opts.setFont(header ? 'bold' : 'regular', BODY_PT)
        doc.fillColor(header ? '#ffffff' : COLOR_TABLE_CELL_TEXT)
        doc.text(cell, x + cellPad, y0 + cellPad, {
          width: colW - cellPad * 2,
          lineGap: 4,
        })
        doc.restore()
        x += colW
      }
      cursorY += rowHeight
    }

    drawRow(
      rows[0].length < cols ? [...rows[0], ...Array(cols - rows[0].length).fill('')] : rows[0],
      true,
      false,
    )
    for (let r = 1; r < rows.length; r++) {
      const padded = [...rows[r], ...Array(cols - rows[r].length).fill('')]
      drawRow(padded.slice(0, cols), false, r % 2 === 1)
    }

    return cursorY + PARAGRAPH_GAP_PT
  }

  /** 将前端渲染的 Mermaid PNG 嵌入 PDF */
  private drawMermaidImage(
    doc: InstanceType<typeof PDFDocument>,
    base64Png: string,
    ctx: {
      marginPt: number
      contentWidth: number
      contentTop: number
      contentBottom: number
      cursorY: number
    },
  ): number {
    let cursorY = ctx.cursorY
    try {
      const buf = Buffer.from(base64Png, 'base64')
      if (buf.length < 24) {
        this.logger.warn('Mermaid PNG base64 无效，跳过嵌入')
        return cursorY
      }
      const ensureBottom = (need: number) => {
        if (cursorY + need > ctx.contentBottom) {
          doc.addPage()
          cursorY = ctx.contentTop
        }
      }
      const maxImgH = Math.min(420, ctx.contentBottom - ctx.contentTop - 24)
      ensureBottom(maxImgH + 16)
      doc.image(buf, ctx.marginPt, cursorY, {
        fit: [ctx.contentWidth, maxImgH],
        align: 'center',
      })
      cursorY = Math.max(doc.y, cursorY + maxImgH * 0.5) + PARAGRAPH_GAP_PT
    } catch (e) {
      this.logger.warn(`嵌入 Mermaid 图片失败: ${(e as Error).message}`)
    }
    return cursorY
  }

  private flushCodeBlock(
    doc: InstanceType<typeof PDFDocument>,
    ctx: {
      marginPt: number
      contentWidth: number
      contentTop: number
      contentBottom: number
      lines: string[]
      cursorY: number
      setFont: (m: 'regular' | 'bold', s: number) => void
    },
  ): number {
    const code = ctx.lines.join('\n')
    ctx.setFont('regular', CODE_PT)
    doc.fillColor('#000000')
    const pad = 10
    const innerW = ctx.contentWidth - 2 * pad
    const h =
      doc.heightOfString(code || ' ', {
        width: innerW,
        lineGap: 4,
      }) + 2 * pad

    let cursorY = ctx.cursorY
    if (cursorY + h > ctx.contentBottom) {
      doc.addPage()
      cursorY = ctx.contentTop
    }

    doc.save()
    const rr = 3
    doc.fillColor(COLOR_CODE_BG)
    doc.roundedRect(ctx.marginPt, cursorY, ctx.contentWidth, h, rr).fill()
    doc.strokeColor(COLOR_TABLE_BORDER).lineWidth(1).roundedRect(ctx.marginPt, cursorY, ctx.contentWidth, h, rr).stroke()
    doc.fillColor('#0f172a')
    doc.font('Courier').fontSize(CODE_PT)
    doc.text(code || ' ', ctx.marginPt + pad, cursorY + pad, {
      width: innerW,
      lineGap: 4,
    })
    doc.restore()

    return cursorY + h + PARAGRAPH_GAP_PT
  }
}
