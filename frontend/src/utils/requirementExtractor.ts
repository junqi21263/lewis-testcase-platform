import type { RequirementPoint } from '@/types/upload'

/**
 * 从解析后的文本中智能提取需求点
 *
 * 策略（优先级从高到低）：
 * 1. 有序/无序列表行（- 、• 、* 、1. 等开头）
 * 2. 包含"应该/需要/必须/支持/禁止/允许"等需求关键词的句子
 * 3. 降级：按换行 + 句号分割，过滤空行
 *
 * @param text         解析后的纯文本
 * @param sourceFile   来源文件名（用于溯源）
 */
export function extractRequirements(
  text: string,
  sourceFile: string,
): RequirementPoint[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 2) // 过滤过短行

  const results: string[] = []

  // ---- 策略 1：列表行 ----
  const listPattern = /^(?:[-•*﹣▪▸►]|\d+[.)、]|[①②③④⑤⑥⑦⑧⑨⑩])\s+(.+)/
  const listLines = lines.filter((l) => listPattern.test(l))

  if (listLines.length >= 3) {
    listLines.forEach((l) => {
      const m = l.match(listPattern)
      if (m) results.push(m[1].trim())
    })
  }

  // ---- 策略 2：需求关键词句子 ----
  if (results.length < 3) {
    const reqKeyword = /应该|需要|必须|不得|不能|禁止|支持|允许|可以|提供|实现|完成|保证|确保|具备/
    lines.forEach((line) => {
      // 按句号、分号分割长行
      const sentences = line.split(/[。；;]/).map((s) => s.trim()).filter(Boolean)
      sentences.forEach((s) => {
        if (reqKeyword.test(s) && s.length > 5) {
          results.push(s)
        }
      })
    })
  }

  // ---- 策略 3：降级兜底 ----
  if (results.length < 3) {
    lines.slice(0, 30).forEach((line) => {
      if (line.length > 8) results.push(line)
    })
  }

  // 去重并限制最大数量（避免 UI 过长）
  const unique = Array.from(new Set(results)).slice(0, 50)

  return unique.map((content) => ({
    id: crypto.randomUUID(),
    content,
    originalContent: content,
    edited: false,
    sourceFile,
    selected: true,
  }))
}
