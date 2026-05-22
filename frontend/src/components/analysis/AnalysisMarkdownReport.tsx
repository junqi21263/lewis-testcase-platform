/**
 * AI 分析报告 Markdown：GFM + 消毒；样式由全局 `.report-readable` 与少量结构类控制。
 * 顶层 `##` 章节可折叠（默认展开），标题左侧 ▶ / ▼，折叠高度带 transition。
 */
import { Children, isValidElement, useCallback, useId, useMemo, useState, type KeyboardEvent } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import { SafeMermaidRenderer } from './SafeMermaidRenderer'
import { cn } from '@/utils/cn'

const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code ?? []), 'className'],
    span: [...(defaultSchema.attributes?.span ?? []), 'className'],
    div: [...(defaultSchema.attributes?.div ?? []), 'className'],
    table: [...(defaultSchema.attributes?.table ?? []), 'className'],
    thead: [...(defaultSchema.attributes?.thead ?? []), 'className'],
    tbody: [...(defaultSchema.attributes?.tbody ?? []), 'className'],
    tr: [...(defaultSchema.attributes?.tr ?? []), 'className'],
    th: [...(defaultSchema.attributes?.th ?? []), 'className'],
    td: [...(defaultSchema.attributes?.td ?? []), 'className'],
  },
}

/** 顶层分段：前言块或 `##` 章节（数组元素为联合类型，注意括号避免解析成 `preface | h2[]`） */
type AnalysisMarkdownTopSection =
  | { kind: 'preface'; body: string }
  | { kind: 'h2'; heading: string; body: string }

function flattenCodeBlockChildren(children: React.ReactNode): string {
  if (typeof children === 'string') return children
  if (Array.isArray(children)) {
    return children
      .map((c) => (typeof c === 'string' || typeof c === 'number' ? String(c) : ''))
      .join('')
  }
  return String(children ?? '')
}

/** 顶层 `## 标题` 分段（不含 `###`），用于折叠块；正文内若再出现 `##` 由 nested 渲染器处理 */
function splitMarkdownByTopLevelH2(markdown: string): AnalysisMarkdownTopSection[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const isH2 = (line: string) => /^##\s+/.test(line) && !/^###/.test(line)

  const out: AnalysisMarkdownTopSection[] = []
  let preface: string[] = []
  let i = 0

  const flushPreface = () => {
    const body = preface.join('\n').replace(/\n+$/, '')
    preface = []
    if (body.trim()) out.push({ kind: 'preface', body })
  }

  while (i < lines.length) {
    const line = lines[i] ?? ''
    if (isH2(line)) {
      flushPreface()
      const heading = line.replace(/^##\s+/, '').trim()
      i++
      const bodyLines: string[] = []
      while (i < lines.length && !isH2(lines[i] ?? '')) {
        bodyLines.push(lines[i] ?? '')
        i++
      }
      out.push({ kind: 'h2', heading, body: bodyLines.join('\n').replace(/^\n+/, '') })
    } else {
      preface.push(line)
      i++
    }
  }
  flushPreface()

  if (out.length === 0) return [{ kind: 'preface', body: markdown }]
  return out
}

/** 章节内再出现的 `##`：与二级视觉一致但不重复折叠控件 */
function buildMdComponents(variant: 'default' | 'nested', isStreaming: boolean): Components {
  const h2ForNested =
    variant === 'nested'
      ? ({ children }: { children?: React.ReactNode }) => <h2 className="!mt-3 !mb-1.5">{children}</h2>
      : undefined

  return {
    h1: ({ children }) => <h1>{children}</h1>,
    h2: h2ForNested ?? (({ children }) => <h2>{children}</h2>),
    h3: ({ children }) => <h3>{children}</h3>,
    h4: ({ children }) => <h4>{children}</h4>,
    p: ({ children }) => <p>{children}</p>,
    ul: ({ children }) => <ul>{children}</ul>,
    ol: ({ children }) => <ol>{children}</ol>,
    li: ({ children }) => (
      <li className="min-w-0 break-words [overflow-wrap:anywhere] leading-relaxed [&>p]:mb-0">{children}</li>
    ),
    strong: ({ children }) => <strong>{children}</strong>,
    em: ({ children }) => <em>{children}</em>,
    blockquote: ({ children }) => <blockquote>{children}</blockquote>,
    hr: () => <hr />,
    a: ({ href, children }) => (
      <a href={href} target="_blank" rel="noopener noreferrer" className="break-all">
        {children}
      </a>
    ),
    code: ({ className, children }) => {
      const inline = !className
      const lang = /language-(\w+)/.exec(className ?? '')?.[1]
      if (!inline && lang === 'mermaid') {
        const chart = flattenCodeBlockChildren(children).replace(/\n$/, '')
        if (!chart.trim()) return null
        return <SafeMermaidRenderer rawSource={chart} isStreaming={isStreaming} />
      }
      if (inline) {
        return <code className="max-w-full break-words [overflow-wrap:anywhere]">{children}</code>
      }
      return (
        <code className={`block max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${className ?? ''}`}>
          {children}
        </code>
      )
    },
    pre: ({ children }) => {
      const first = Children.toArray(children)[0]
      if (
        isValidElement(first) &&
        typeof first.props === 'object' &&
        first.props !== null &&
        'className' in first.props &&
        String((first.props as { className?: string }).className ?? '').includes('language-mermaid')
      ) {
        return <div className="mb-3">{children}</div>
      }
      return <pre className="mb-3 max-w-full overflow-x-auto whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{children}</pre>
    },
    table: ({ children }) => (
      <div className="mb-4 w-full max-w-full overflow-x-auto rounded border border-[color:var(--ui-report-border)]">
        <table className="w-full min-w-0 table-fixed border-collapse">{children}</table>
      </div>
    ),
    thead: ({ children }) => <thead className="bg-[color:var(--ui-report-surface)]">{children}</thead>,
    tbody: ({ children }) => <tbody>{children}</tbody>,
    tr: ({ children }) => <tr className="border-b border-[color:var(--ui-report-border)] last:border-b-0">{children}</tr>,
    th: ({ children }) => (
      <th className="border border-[color:var(--ui-report-border)] px-2 py-2 text-left align-top font-bold break-words [overflow-wrap:anywhere]">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="border border-[color:var(--ui-report-border)] px-2 py-2 align-top break-words [overflow-wrap:anywhere]">
        {children}
      </td>
    ),
  }
}


function CollapsibleH2Section({
  heading,
  body,
  isStreaming,
}: {
  heading: string
  body: string
  isStreaming: boolean
}) {
  const [open, setOpen] = useState(true)
  const panelId = useId()

  const onKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setOpen((o) => !o)
    }
  }, [])

  return (
    <section className="mb-1 border-b border-[color:var(--ui-report-border)] pb-3 last:border-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        className="flex w-full min-w-0 items-start gap-2 rounded-lg bg-transparent py-2 pl-1 text-left outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-[color:var(--ui-report-h2-accent)]"
      >
        <span
          className="mt-0.5 inline-flex h-5 w-5 shrink-0 select-none items-center justify-center text-[11px] leading-none"
          style={{ color: 'var(--ui-report-text-muted)' }}
          aria-hidden
        >
          {open ? '▼' : '▶'}
        </span>
        <span
          className="min-w-0 flex-1 break-words border-l-[3px] pl-2 font-bold leading-snug"
          style={{
            borderColor: 'var(--ui-report-h2-accent)',
            color: 'var(--ui-report-text-primary)',
            fontSize: 'var(--text-section-title-size)',
          }}
        >
          {heading}
        </span>
      </button>
      <div
        className={`grid min-h-0 transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div id={panelId} className="min-h-0 overflow-hidden">
          <div className="max-w-full pt-1 pl-7 pr-0 sm:pr-1">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
              components={buildMdComponents('nested', isStreaming)}
            >
              {body}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    </section>
  )
}

export function AnalysisMarkdownReport({
  text,
  className,
  isStreaming = false,
}: {
  text: string
  className?: string
  /** 报告流式生成中：Mermaid 延迟/等待完整语法后再渲染 */
  isStreaming?: boolean
}) {
  const sections = useMemo(() => splitMarkdownByTopLevelH2(text), [text])
  const hasCollapsible = sections.some((s) => s.kind === 'h2')
  const mdDefault = useMemo(() => buildMdComponents('default', isStreaming), [isStreaming])

  if (!hasCollapsible) {
    return (
      <div className={cn('report-readable', className)}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeSanitize, sanitizeSchema]]} components={mdDefault}>
          {text}
        </ReactMarkdown>
      </div>
    )
  }

  return (
    <div className={cn('report-readable', className)}>
      {sections.map((sec, i) =>
        sec.kind === 'preface' ? (
          <ReactMarkdown
            key={`p-${i}`}
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
            components={mdDefault}
          >
            {sec.body}
          </ReactMarkdown>
        ) : (
          <CollapsibleH2Section
            key={`h2-${i}-${sec.heading}`}
            heading={sec.heading}
            body={sec.body}
            isStreaming={isStreaming}
          />
        ),
      )}
    </div>
  )
}
