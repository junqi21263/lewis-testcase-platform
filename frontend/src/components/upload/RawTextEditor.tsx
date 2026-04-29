/**
 * 原始文本编辑：行号 gutter、字数统计、关键词预览高亮（只读预览区）
 */

import { useRef, useEffect, useMemo, useState, useCallback } from 'react'
import { cn } from '@/utils/cn'
import { Input } from '@/components/ui/input'

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function highlightKeywords(text: string, keywords: string[]): string {
  if (!keywords.length || !text) return escapeHtml(text)
  let out = escapeHtml(text)
  for (const kw of keywords) {
    const k = kw.trim()
    if (k.length < 1) continue
    const safe = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`(${safe})`, 'gi')
    out = out.replace(re, '<mark class="bg-amber-500/25 text-amber-200 rounded px-0.5">$1</mark>')
  }
  return out
}

interface RawTextEditorProps {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

export default function RawTextEditor({
  value,
  onChange,
  placeholder,
  disabled,
  className,
}: RawTextEditorProps) {
  const taRef = useRef<HTMLTextAreaElement>(null)
  const lineRef = useRef<HTMLDivElement>(null)
  const [kwInput, setKwInput] = useState('')

  const lineCount = useMemo(() => Math.max(1, value.split('\n').length), [value])
  const lineNumbers = useMemo(
    () => Array.from({ length: lineCount }, (_, i) => i + 1).join('\n'),
    [lineCount],
  )

  const keywords = useMemo(
    () =>
      kwInput
        .split(/[,，;；\s]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    [kwInput],
  )

  const charCount = value.length
  const wordEstimate = value.replace(/\s+/g, '').length

  const syncScroll = useCallback(() => {
    const ta = taRef.current
    const ln = lineRef.current
    if (ta && ln) ln.scrollTop = ta.scrollTop
  }, [])

  useEffect(() => {
    syncScroll()
  }, [value, syncScroll])

  const previewHtml = useMemo(() => {
    if (keywords.length === 0) return ''
    const slice = value.length > 8000 ? `${value.slice(0, 8000)}\n…` : value
    return highlightKeywords(slice, keywords)
  }, [value, keywords])

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs text-muted-foreground">
        <span>
          字数 <strong className="text-foreground tabular-nums">{charCount}</strong>
          {' · '}
          非空白 <strong className="text-foreground tabular-nums">{wordEstimate}</strong>
        </span>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className="flex-shrink-0 hidden sm:inline">关键词高亮</span>
          <Input
            value={kwInput}
            onChange={(e) => setKwInput(e.target.value)}
            placeholder="逗号分隔，如：登录,实名"
            className="h-8 text-xs flex-1 min-w-0"
            disabled={disabled}
          />
        </div>
      </div>

      <div
        className={cn(
          'flex overflow-hidden rounded-lg bg-muted/35 shadow-sm ring-1 ring-inset ring-foreground/10 backdrop-blur-md dark:ring-white/10',
          'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background',
        )}
      >
        <div
          ref={lineRef}
          className="flex-shrink-0 w-9 sm:w-10 py-2 pl-2 pr-1 text-right font-mono text-[10px] sm:text-xs text-muted-foreground/70 bg-muted/50 border-r border-border select-none overflow-hidden"
          aria-hidden
        >
          <pre className="leading-[1.45] whitespace-pre">{lineNumbers}</pre>
        </div>
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={syncScroll}
          placeholder={placeholder}
          disabled={disabled}
          spellCheck={false}
          className={cn(
            'flex-1 min-h-[220px] min-w-0 py-2 pr-3 pl-2',
            'text-xs sm:text-sm leading-[1.45] font-mono',
            'bg-transparent border-0 resize-y outline-none text-foreground placeholder:text-muted-foreground',
          )}
        />
      </div>

      {keywords.length > 0 && previewHtml && (
        <div className="max-h-36 overflow-y-auto rounded-md bg-card/50 p-2 shadow-sm ring-1 ring-inset ring-foreground/10 backdrop-blur-md dark:ring-white/10">
          <p className="text-[10px] text-muted-foreground mb-1">关键词预览（只读）</p>
          <pre
            className="text-[11px] leading-relaxed whitespace-pre-wrap break-words font-mono"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        </div>
      )}
    </div>
  )
}
