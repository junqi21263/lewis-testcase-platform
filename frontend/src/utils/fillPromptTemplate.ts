/**
 * 将文档解析结果填入提示词模板占位符。
 * 兼容：{{结构化需求}}、{{需求原文}}、{{REQUIREMENTS}}（大小写不敏感）
 */

/**
 * @param templateBody 模板正文（来自 PromptTemplate.content）
 * @param structuredLines 已勾选的需求条目（纯文本列表）
 * @param rawText 原始/脱敏后的全文
 */
export function fillPromptTemplate(
  templateBody: string,
  structuredLines: string[],
  rawText: string,
): string {
  const structuredNumbered = structuredLines
    .map((l, i) => `${i + 1}. ${l}`)
    .join('\n')

  let out = templateBody
  out = out.replace(/\{\{\s*结构化需求\s*\}\}/g, structuredNumbered)
  out = out.replace(/\{\{\s*需求原文\s*\}\}/g, rawText)
  out = out.replace(/\{\{\s*REQUIREMENTS\s*\}\}/gi, structuredNumbered)
  out = out.replace(/\{\{\s*requirements\s*\}\}/gi, structuredNumbered)

  return out
}
