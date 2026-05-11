/**
 * AI 分析报告 Markdown 渲染：GFM（表格、任务列表等）+ 基础 XSS 消毒。
 */
import { Children, isValidElement } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
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

const mdComponents: Components = {
  h1: ({ children }) => (
    <h1 className="text-xl font-bold text-foreground mt-4 mb-2 border-b border-border/40 pb-1">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-lg font-semibold text-foreground mt-4 mb-2">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-base font-semibold text-foreground mt-3 mb-1">{children}</h3>
  ),
  h4: ({ children }) => <h4 className="text-sm font-semibold text-foreground mt-2 mb-1">{children}</h4>,
  p: ({ children }) => <p className="text-gray-300 text-sm leading-relaxed mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => (
    <ul className="list-disc pl-5 space-y-1 text-gray-300 text-sm mb-2 marker:text-primary">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal pl-5 space-y-1 text-gray-300 text-sm mb-2 marker:text-primary">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed [&>p]:mb-0">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  em: ({ children }) => <em className="italic text-gray-200">{children}</em>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-primary/40 pl-3 my-2 text-gray-400 text-sm italic">{children}</blockquote>
  ),
  hr: () => <hr className="border-border/30 my-4" />,
  a: ({ href, children }) => (
    <a
      href={href}
      className="text-primary underline underline-offset-2 hover:text-primary/90 break-all"
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
        <code className="rounded bg-white/10 px-1.5 py-0.5 text-[0.85em] font-mono text-amber-200/95">{children}</code>
      )
    }
    return (
      <code className={`block font-mono text-xs text-gray-200 ${className ?? ''}`}>{children}</code>
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
      return <div className="mb-2">{children}</div>
    }
    return (
      <pre className="mb-2 overflow-x-auto rounded-lg border border-white/10 bg-black/45 p-3 font-mono text-xs shadow-inner">
        {children}
      </pre>
    )
  },
  table: ({ children }) => (
    <div className="overflow-x-auto mb-2 rounded-md border border-white/10">
      <table className="min-w-full border-collapse text-sm text-gray-300">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-white/5">{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr className="border-b border-white/10 last:border-0">{children}</tr>,
  th: ({ children }) => (
    <th className="border border-white/10 px-2 py-1.5 text-left font-semibold text-foreground">{children}</th>
  ),
  td: ({ children }) => <td className="border border-white/10 px-2 py-1.5 align-top">{children}</td>,
}

export function AnalysisMarkdownReport({ text, className }: { text: string; className?: string }) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
        components={mdComponents}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
