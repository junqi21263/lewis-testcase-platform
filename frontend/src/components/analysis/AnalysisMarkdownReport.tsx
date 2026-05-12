/**
 * AI 分析报告 Markdown：GFM + 消毒；标题/表格/代码块样式与 AI 需求分析终端一致；
 * 顶层 `##` 章节可折叠（默认展开），便于长报告浏览。
 */
import { Children, isValidElement, useCallback, useId, useMemo, useState, type KeyboardEvent } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { MermaidBlock } from './MermaidBlock'

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

/** 顶层 `## 标题` 分段（不含 `###`），用于折叠块；正文内若再出现 `##` 由 nested 渲染器处理 */
function splitMarkdownByTopLevelH2(markdown: string): { kind: 'preface'; body: string } | { kind: 'h2'; heading: string; body: string }[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const isH2 = (line: string) => /^##\s+/.test(line) && !/^###/.test(line)

  const out: ({ kind: 'preface'; body: string } | { kind: 'h2'; heading: string; body: string })[] = []
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
function buildMdComponents(variant: 'default' | 'nested'): Components {
  const h2ForNested =
    variant === 'nested'
      ? ({ children }: { children?: React.ReactNode }) => (
          <h2 className="text-[16px] font-bold text-[#E2E8F0] mt-4 mb-2 pl-2 border-l-4 border-l-[#3B82F6]">
            {children}
          </h2>
        )
      : undefined

  return {
    h1: ({ children }) => (
      <h1 className="text-[20px] font-bold text-white mt-6 mb-3 pb-2 border-b-2 border-[#3B82F6] first:mt-0">
        {children}
      </h1>
    ),
    h2:
      h2ForNested ??
      (({ children }) => (
        <h2 className="text-[16px] font-bold text-[#E2E8F0] mt-4 mb-2 pl-2 border-l-4 border-l-[#3B82F6]">{children}</h2>
      )),
    h3: ({ children }) => (
      <h3 className="text-[14px] font-bold text-[#CBD5E1] mt-3 mb-1.5">{children}</h3>
    ),
    h4: ({ children }) => <h4 className="text-[13px] font-semibold text-[#CBD5E1] mt-2 mb-1">{children}</h4>,
    p: ({ children }) => (
      <p className="text-[13px] text-[#94A3B8] leading-[1.6] mb-2 last:mb-0">{children}</p>
    ),
    ul: ({ children }) => (
      <ul className="list-disc pl-5 space-y-1 text-[13px] text-[#94A3B8] leading-[1.6] mb-2 marker:text-[#3B82F6]">
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className="list-decimal pl-5 space-y-1 text-[13px] text-[#94A3B8] leading-[1.6] mb-2 marker:text-[#3B82F6]">
        {children}
      </ol>
    ),
    li: ({ children }) => <li className="leading-[1.6] [&>p]:mb-0">{children}</li>,
    strong: ({ children }) => <strong className="font-semibold text-[#E2E8F0]">{children}</strong>,
    em: ({ children }) => <em className="italic text-[#CBD5E1]">{children}</em>,
    blockquote: ({ children }) => (
      <blockquote className="rounded bg-[#1E293B] border border-[#334155] pl-3 pr-3 py-3 my-3 text-[13px] text-[#94A3B8] leading-[1.6] not-italic">
        {children}
      </blockquote>
    ),
    hr: () => <hr className="border-[#334155] my-6" />,
    a: ({ href, children }) => (
      <a
        href={href}
        className="text-[#60A5FA] underline underline-offset-2 hover:text-[#93C5FD] break-all"
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    ),
    code: ({ className, children }) => {
      const inline = !className
      const lang = /language-(\w+)/.exec(className ?? '')?.[1]
      if (!inline && lang === 'mermaid') {
        const chart = String(children).replace(/\n$/, '')
        return <MermaidBlock chart={chart} />
      }
      if (inline) {
        return (
          <code className="rounded bg-[#1E293B] px-1.5 py-0.5 text-[0.85em] font-mono text-[#E2E8F0]">{children}</code>
        )
      }
      return <code className={`block font-mono text-[12px] text-[#E2E8F0] ${className ?? ''}`}>{children}</code>
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
      return (
        <pre className="mb-3 overflow-x-auto rounded bg-[#1E293B] p-3 font-mono text-[12px] text-[#E2E8F0] border border-[#334155]">
          {children}
        </pre>
      )
    },
    table: ({ children }) => (
      <div className="overflow-x-auto mb-4 w-full rounded border border-[#334155]">
        <table className="w-full min-w-0 border-collapse text-[13px] [&_tbody_tr:nth-child(odd)]:bg-[#0F172A] [&_tbody_tr:nth-child(even)]:bg-[#1E293B]">
          {children}
        </table>
      </div>
    ),
    thead: ({ children }) => <thead className="bg-[#1E293B]">{children}</thead>,
    tbody: ({ children }) => <tbody>{children}</tbody>,
    tr: ({ children }) => <tr className="border-b border-[#334155] last:border-b-0">{children}</tr>,
    th: ({ children }) => (
      <th className="border border-[#334155] px-2 py-2 text-left font-bold text-white align-top">{children}</th>
    ),
    td: ({ children }) => <td className="border border-[#334155] px-2 py-2 align-top text-[#94A3B8]">{children}</td>,
  }
}

const mdDefault = buildMdComponents('default')
const mdNested = buildMdComponents('nested')

function CollapsibleH2Section({ heading, body }: { heading: string; body: string }) {
  const [open, setOpen] = useState(true)
  const panelId = useId()

  const onKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setOpen((o) => !o)
    }
  }, [])

  return (
    <section className="mb-1 border-b border-[#334155]/60 pb-3 last:border-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        className="flex w-full items-start gap-2 rounded bg-transparent py-2 pl-2 text-left outline-none ring-offset-[#111125] focus-visible:ring-2 focus-visible:ring-[#3B82F6]"
      >
        <span className="mt-0.5 shrink-0 text-[#94A3B8]" aria-hidden>
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
        <span className="text-[16px] font-bold leading-snug text-[#E2E8F0] border-l-4 border-l-[#3B82F6] pl-2">
          {heading}
        </span>
      </button>
      {open && (
        <div id={panelId} className="pl-8 pt-1">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeSanitize, sanitizeSchema]]} components={mdNested}>
            {body}
          </ReactMarkdown>
        </div>
      )}
    </section>
  )
}

export function AnalysisMarkdownReport({ text, className }: { text: string; className?: string }) {
  const sections = useMemo(() => splitMarkdownByTopLevelH2(text), [text])
  const hasCollapsible = sections.some((s) => s.kind === 'h2')

  if (!hasCollapsible) {
    return (
      <div className={className}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeSanitize, sanitizeSchema]]} components={mdDefault}>
          {text}
        </ReactMarkdown>
      </div>
    )
  }

  return (
    <div className={className}>
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
          <CollapsibleH2Section key={`h2-${i}-${sec.heading}`} heading={sec.heading} body={sec.body} />
        ),
      )}
    </div>
  )
}
