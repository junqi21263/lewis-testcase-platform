import { useEffect, useState } from 'react'
import { SafeMermaidRenderer } from '@/components/analysis/SafeMermaidRenderer'

export const dirtyMermaidSource = `
flowchart TD
  1. A[提交(移动端, iOS)] -->oNext{是否成功?}
  - oNext -- 是 --> C[end]
  * oNext -- 否 --> xFail[失败(网络异常)]
`

export function SafeMermaidRendererStory() {
  return <SafeMermaidRenderer rawSource={dirtyMermaidSource} />
}

export function StreamingMermaidStory() {
  const [source, setSource] = useState(dirtyMermaidSource)

  useEffect(() => {
    const t = window.setTimeout(() => {
      setSource(`${dirtyMermaidSource}\n  xFail -->`)
    }, 1_100)
    return () => window.clearTimeout(t)
  }, [])

  return <SafeMermaidRenderer rawSource={source} isStreaming />
}
