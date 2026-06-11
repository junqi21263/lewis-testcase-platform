# AI 输出质量评分与覆盖分析技术设计

## 设计目标

- 在不改数据库的前提下，为生成结果提供即时质量分析。
- 复用现有生成和解析链路，不引入新的模型调用。
- 保持质量分析为纯函数，便于前后端测试和后续迁移到持久化层。

## 总体方案

在后端生成流程完成“结构化用例落库”前后，基于两类输入计算质量报告：

1. 需求原文：由 `GenerateDto.text` 或解析后的 `fileContent` 提供。
2. 结构化用例：由 `resolveCasesForPersistenceWithRepair()` 产出的用例行提供。

后端将质量报告作为响应附加字段返回：

- 非流式：`POST /ai/generate`
- 流式：SSE 的 done meta

前端将该报告写入生成页 store，并在结果区顶部渲染“质量检查”面板。

## 数据结构

后端与前端保持同名 JSON 结构：

```ts
type QualityIssueType =
  | 'duplicate'
  | 'generic_title'
  | 'generic_step'
  | 'generic_expected'
  | 'missing_steps'
  | 'missing_expected'
  | 'low_detail'

type CoverageStatus = 'covered' | 'partial' | 'missing'
type RiskLevel = 'high' | 'medium' | 'low'

interface QualityIssueItem {
  caseTitle: string
  type: QualityIssueType
  severity: 'high' | 'medium' | 'low'
  message: string
}

interface CoverageItem {
  requirement: string
  status: CoverageStatus
  matchedCaseTitles: string[]
}

interface DistributionItem {
  label: string
  count: number
}

interface QualityReport {
  score: number
  summary: string
  requirementPointsTotal: number
  coverageRate: number | null
  coverage: CoverageItem[]
  duplicateCount: number
  genericCount: number
  nonExecutableCount: number
  riskDistribution: DistributionItem[]
  priorityDistribution: DistributionItem[]
  suggestions: string[]
  issues: QualityIssueItem[]
}
```

## 规则设计

### 1. 需求点提取

新增纯函数，从需求文本中提取最小需求点列表。

输入来源优先级：

1. `dto.text`
2. `fileContent`

提取规则：

- 按换行、编号、项目符号拆分。
- 保留长度在 6-80 字之间的语义片段。
- 忽略明显是标题、空行、装饰符的内容。
- 对“登录、支付、权限、导出、审批、通知”等关键词保持原样，不做过度切分。

若提取后为空，则 `coverageRate = null`，并返回空覆盖列表。

### 2. 覆盖匹配

对每个需求点，将其与每条用例的聚合文本做启发式匹配。

聚合文本包含：

- 标题
- 前置条件
- 步骤 action
- 预期结果
- tags

匹配策略：

- 先做规范化：小写、去空白、统一中文标点。
- 提取关键词集合，过滤停用词。
- 若需求点完整短语直接命中某条用例文本，视为 `covered`。
- 若关键词命中比例达到阈值但无完整短语命中，视为 `partial`。
- 否则为 `missing`。

### 3. 重复检测

先构造每条用例的指纹：

- 规范化标题
- 规范化步骤动作串
- 规范化预期结果

命中任一条件即记为重复对：

- 标题完全一致且步骤主串一致
- 标题高度相似且前两步动作一致

报告只计入重复用例条数，不在首期展示成对 diff。

### 4. 空泛检测

命中以下规则之一即判定为空泛：

- 标题是“功能测试”“场景验证”“检查是否正常”等泛化表述。
- 步骤只有“进入页面后验证功能”“执行操作并查看结果”等无明确对象/动作。
- 预期结果只有“成功”“正常”“符合预期”“显示正确”等口号式表述。

### 5. 不可执行检测

命中以下规则之一即判定为不可执行：

- 无步骤。
- 无预期结果。
- 所有步骤都过短或缺少操作动词。
- 预期结果无法与步骤建立对应关系，且内容过短。

### 6. 风险等级推断

风险等级不落库，按规则实时推断：

- `high`：`P0/P1`，或命中登录、权限、支付、下单、退款、删除、审批、导出、核心链路等关键词。
- `medium`：`P2`，或命中异常、边界、校验、兼容类关键词。
- `low`：其余情况。

### 7. 综合评分

建议采用固定权重：

- 覆盖率：40 分
- 重复检测：20 分
- 空泛 / 不可执行：25 分
- 风险与优先级分布：15 分

分数范围限制在 `0-100`。

## 后端改动

新增：

- `backend/src/modules/ai/quality-check.util.ts`
  - 纯函数实现需求点提取、覆盖分析、问题检测、风险分布和综合评分。

修改：

- `backend/src/modules/ai/ai.service.ts`
  - 在非流式 `generate()` 返回体中增加 `qualityReport`
  - 在流式 `generateStream()` 完成时的 done meta 中增加 `qualityReport`
  - 质量报告以结构化用例行为输入，保证与最终落库结果一致

## 前端改动

修改：

- `frontend/src/types/index.ts`
  - 增加 `QualityReport` 等类型定义。
- `frontend/src/api/ai.ts`
  - `GenerateResult` 增加 `qualityReport`
- `frontend/src/utils/request.ts`
  - `StreamDoneMeta` 增加 `qualityReport`
- `frontend/src/store/generateStore.ts`
  - 增加 `qualityReport`
  - 复用现有 `qualityScore` / `qualitySuggestions`
- `frontend/src/pages/GeneratePage.tsx`
  - 生成完成时把 `qualityReport` 写入 store
  - 结果页顶部新增质量检查面板

## UI 展示

结果页质量检查面板建议包含 4 块：

1. 综合评分与一句摘要
2. 覆盖分析
3. 问题检测摘要
4. 风险 / 优先级分布与改进建议

显示原则：

- 信息密度高，但不抢占用例列表主体。
- 缺失项和问题项优先展示前 3-5 个，避免面板过长。
- 无法计算覆盖率时明确提示“当前输入不足以提取需求点”。

## 测试策略

后端：

- 新增 `backend/test/ai-output-quality.spec.ts`
- 使用固定需求文本和固定 cases 断言：
  - 覆盖率计算
  - 缺失需求点识别
  - 重复用例识别
  - 空泛 / 不可执行识别
  - 优先级和风险分布

前端：

- 新增 `frontend/src/utils/qualityReport.unit.test.ts`
  - 针对展示辅助函数或摘要格式化函数做断言
- 如直接在页面中消费 store，可不为纯展示 JSX 单独加重型测试，但需保证类型与数据流正确

## 兼容性与扩展

- 首期为纯规则引擎，后续可替换部分规则为模型评审，但返回结构不变。
- 后续若需要记录中心复用，可在 DB 中新增 `qualityReport` JSON 字段，当前设计无需重写前后端消费逻辑。
- 若后续接入更多文件类型或英文需求，可扩展关键词词典和停用词表，但不应改变现有字段协议。
