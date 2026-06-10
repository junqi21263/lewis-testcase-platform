# 解析与导出契约测试技术文档

## 设计原则

- 契约测试验证“输入经过平台转换后应得到什么输出”，不验证第三方服务本身。
- 样例数据必须小、稳定、可读，避免二进制大文件进入首期范围。
- 前后端共享语义通过样例和断言保持一致，不引入运行时共享包。
- 每个契约测试只覆盖一个行为，失败信息应能直接定位到解析、规范化或导出层。

## 目录结构

```text
frontend/src/test/fixtures/contracts/
  analysis-report/
    mermaid-subroutine.md
  export/
    testcase-export-cases.ts
```

后续扩展建议：

```text
backend/test/fixtures/contracts/
  ai-output/
  file-parse/
  export/
```

## 首期测试覆盖

### Mermaid 流程图规范化

目标：需求分析报告中的 Mermaid flowchart 在页面预览和 PDF 导出前使用同一套 `normalizeMermaidSource` 规则。

重点断言：

- `A[[子流程]]` 这类子流程节点不会被普通 `[]` 清洗逻辑破坏。
- 节点 label 中的中文、空格、括号、冒号会被安全处理。
- Markdown 中的 Mermaid 代码块可以被导出工具稳定提取。

### 用例 Excel 导出

目标：用户点击导出 Excel 时，无论是否已有服务端 suiteId，都能得到真实 `.xlsx` 文件。

重点断言：

- 前端兜底导出返回 MIME `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`。
- 文件名后缀为 `.xlsx`。
- 表头顺序与后端导出一致：
  `用例名称、所属模块、标签、前置条件、步骤描述、预期结果、编辑模式、备注、用例等级`。

## 实现方案

### 1. 抽出前端 XLSX 兜底导出工具

新增 `frontend/src/utils/exportTestcasesXlsx.ts`：

- 输入：`TestCase[]`、可选 suite/module 名称、可选文件名时间。
- 输出：`Blob`、文件名、MIME，或直接触发浏览器下载。
- 内部复用 `TESTCASE_EXPORT_COLUMNS_CN` 和 `testcaseDelimitedValues`，保证列顺序与后端一致。

`GeneratePage` 在服务端导出失败或没有 `suiteId` 时调用该工具，而不是提示“Excel 需服务端用例集”。

### 2. 修复 Mermaid flowchart 标签清洗顺序

`sanitizeFlowchartNodeLabels` 应先处理 `[[...]]` 子流程节点，再处理普通 `[...]` 节点，避免普通正则提前吃掉第一个 `]` 造成 Mermaid 语法损坏。

### 3. 暴露 Mermaid Markdown 提取函数

`analysisMermaidPdf.ts` 中增加可测试的 `extractMermaidBlocksForPdf(markdown)`，PDF 导出继续调用同一函数。测试可以不依赖真实 Mermaid 渲染，直接验证提取与规范化结果。

## 测试命令

```bash
pnpm -C frontend test:unit
pnpm -C frontend build
pnpm -C backend test
```

## CI 接入建议

短期沿用现有前端 unit 和后端 Jest 命令。后续如果契约样例增多，可增加独立脚本：

```json
{
  "test:contracts": "vitest run src/**/*.contract.test.ts"
}
```

## 扩展规则

- 每修复一个解析或导出问题，必须补一个最小契约样例。
- 样例命名应描述业务输入，而不是 bug 编号。
- 若前后端存在同义解析逻辑，必须各有断言，或使用同一份 fixture 文本。
- 契约测试不得依赖当前日期；涉及文件名时必须注入固定时间或使用 fake timers。
