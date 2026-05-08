/**
 * 将 DOM 区域导出为多页 A4 PDF（html2canvas 截图 + jsPDF），适合中文与 Markdown 渲染结果。
 * 页脚含导出时间与页码。
 */
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

export function buildAnalysisPdfFileName(originalName?: string | null): string {
  const raw = originalName?.trim() || '需求分析报告'
  const safe = raw.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80)
  const day = new Date().toISOString().slice(0, 10)
  return `${safe}_${day}.pdf`
}

/**
 * 经典「长图分页」算法：单张 canvas 按页面高度切片展示。
 */
export async function exportReportRegionToPdf(element: HTMLElement, fileName: string): Promise<void> {
  const canvas = await html2canvas(element, {
    scale: Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 2 : 2),
    useCORS: true,
    logging: false,
    backgroundColor: '#111125',
    scrollX: 0,
    scrollY: 0,
    width: element.scrollWidth,
    height: element.scrollHeight,
  })

  const imgData = canvas.toDataURL('image/jpeg', 0.92)
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 12
  const pdfInnerWidth = pageWidth - 2 * margin
  const pdfInnerHeight = pageHeight - 2 * margin

  const imgHeightMm = (canvas.height * pdfInnerWidth) / canvas.width
  let heightLeft = imgHeightMm
  let y = margin

  pdf.addImage(imgData, 'JPEG', margin, y, pdfInnerWidth, imgHeightMm)
  heightLeft -= pdfInnerHeight

  while (heightLeft > 0) {
    y = heightLeft - imgHeightMm + margin
    pdf.addPage()
    pdf.addImage(imgData, 'JPEG', margin, y, pdfInnerWidth, imgHeightMm)
    heightLeft -= pdfInnerHeight
  }

  const total = pdf.getNumberOfPages()
  const exportedAt = new Date().toLocaleString('zh-CN', { hour12: false })
  for (let i = 1; i <= total; i++) {
    pdf.setPage(i)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7)
    pdf.setTextColor(120, 120, 135)
    pdf.text(`AI 需求分析 · ${exportedAt}`, margin, pageHeight - 5)
    pdf.text(`${i} / ${total}`, pageWidth - margin, pageHeight - 5, { align: 'right' })
    pdf.setDrawColor(210, 210, 225)
    pdf.setLineWidth(0.2)
    pdf.line(margin, pageHeight - 7.5, pageWidth - margin, pageHeight - 7.5)
    pdf.setTextColor(0, 0, 0)
  }

  pdf.save(fileName)
}
