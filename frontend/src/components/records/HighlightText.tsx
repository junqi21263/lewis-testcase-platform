import type { ReactNode } from 'react'

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 对查询词（空格分词）做不区分大小写高亮 */
export function HighlightText({ text, query }: { text: string; query: string }): ReactNode {
  const q = query.trim()
  if (!q) return text
  const terms = [...new Set(q.split(/\s+/).filter(Boolean))].map(escapeRe).join('|')
  if (!terms) return text
  const re = new RegExp(`(${terms})`, 'gi')
  const parts = text.split(re)
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="bg-amber-500/25 text-amber-100 rounded px-0.5">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  )
}
