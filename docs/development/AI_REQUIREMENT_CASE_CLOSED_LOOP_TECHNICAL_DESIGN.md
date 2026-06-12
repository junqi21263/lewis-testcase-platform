# AI 需求-用例闭环代理技术设计

## 总体方案

新增一个后端闭环服务，围绕现有生成记录运行一次可解释优化：

1. 读取 `GenerationRecord`、当前 `TestSuite` 和 `TestCase`。
2. 调用现有 `buildQualityReport(requirementText, rows)` 得到覆盖与质量问题。
3. 使用规则引擎生成修订计划。
4. 在事务中更新被修订用例、创建缺失需求补齐用例、写入版本与评论。
5. 重新计算质量报告并返回前端。

首期不新增数据库 schema，复用 `TestCaseVersion.changeSummary` 与 `TestCaseComment.content` 承载原因。

## 后端接口

新增：

```http
POST /api/ai/records/:recordId/close-loop
```

返回：

```ts
interface ClosedLoopResult {
  recordId: string
  suiteId: string
  beforeScore: number
  afterScore: number
  addedCount: number
  updatedCount: number
  duplicateMarkedCount: number
  cases: TestCase[]
  qualityReport: QualityReport
  actions: ClosedLoopAction[]
  summary: string
}
```

## 文件结构

新增：

- `backend/src/modules/ai/closed-loop-agent.util.ts`
  - 纯规则引擎：输入需求文本、用例行和质量报告，输出修订计划。
- `backend/test/ai-closed-loop-agent.spec.ts`
  - 覆盖缺失需求补齐、重复标记、空泛/不可执行修订、幂等控制。

修改：

- `backend/src/modules/ai/ai.service.ts`
  - 增加 `runClosedLoop(recordId, userId)`。
- `backend/src/modules/ai/ai.controller.ts`
  - 增加闭环接口。
- `frontend/src/api/ai.ts`
  - 增加闭环 API 类型与方法。
- `frontend/src/store/generateStore.ts`
  - 增加闭环执行状态和报告。
- `frontend/src/pages/GeneratePage.tsx`
  - 质量面板新增入口和摘要展示。

## 规则引擎

### 输入类型

```ts
interface ClosedLoopCaseInput {
  id?: string
  title: string
  priority: 'P0' | 'P1' | 'P2' | 'P3'
  type: TestCaseType
  precondition?: string | null
  steps: TestStep[]
  expectedResult: string
  tags: string[]
}
```

### 动作类型

```ts
type ClosedLoopActionType =
  | 'add_missing_requirement'
  | 'refine_generic'
  | 'fix_non_executable'
  | 'mark_duplicate'

interface ClosedLoopAction {
  type: ClosedLoopActionType
  caseId?: string
  caseTitle: string
  requirement?: string
  reason: string
  beforeTitle?: string
  afterTitle?: string
}
```

### 幂等控制

补齐用例统一写入标签：

- `ai-closed-loop`
- `需求补齐:<需求点指纹>`

后续再次运行时，如果已有相同需求指纹标签，则不重复新增。

### 补齐用例生成

对缺失需求点生成 1 条用例：

- title：`${模块或需求关键词}-${需求点摘要}验证`
- priority：包含登录、权限、支付、删除、导出等关键词时为 `P1`，否则 `P2`
- type：默认 `FUNCTIONAL`
- steps：三步结构，进入相关功能、执行需求动作、观察结果
- expectedResult：与步骤一一对应的 `[1] [2] [3]` 编号结果
- tags：`ai-closed-loop`、`需求补齐:<hash>`、`模块:<推断模块>`

### 修订策略

- 空泛标题：从需求文本和原用例内容抽取关键词重写标题。
- 空泛步骤：补齐为“打开/进入、执行、确认”的明确动作。
- 缺少预期：按步骤数量生成可验证预期。
- 不可执行：确保至少 3 条步骤和对应预期。
- 重复用例：不删除，仅追加 `待合并` 和 `ai-duplicate` 标签，并写评论说明重复对象。

## 评审写入

在事务中：

1. 更新原 `TestCase`。
2. 获取对应 `TestCaseReview.currentVersionNumber`。
3. 创建 `TestCaseVersion`，`sourceType` 使用现有 `manual_edit`，`changeSummary` 以 `AI 闭环优化：` 开头。
4. 更新 `TestCaseReview.currentVersionNumber` 与 `latestComment`。
5. 创建 `TestCaseComment`，`commentType = note`，内容写明修改原因。

新增用例：

1. 创建 `TestCase`。
2. 创建 `TestCaseReview`。
3. 创建 v1 `TestCaseVersion`，`changeSummary = AI 闭环补齐：<需求点>`。
4. 创建评论说明补齐原因。

## 前端交互

质量检查面板底部增加按钮：

- 主按钮：`生成最终推荐版`
- 执行中：按钮 disabled，显示加载 icon。
- 成功后：显示“新增 N 条 / 修订 N 条 / 标记重复 N 条 / 评分 A→B”。
- 失败：toast 显示后端错误，保留当前用例。

成功后同步更新：

- `generatedCases`
- `qualityReport`
- `closedLoopReport`

## 测试策略

后端单元测试：

- 缺失需求点生成补齐用例。
- 空泛/不可执行用例被修订为可执行结构。
- 重复用例只标记不删除。
- 已有 `需求补齐:<hash>` 标签时不重复新增。

后端构建：

- `pnpm -C backend test -- ai-closed-loop-agent.spec.ts`
- `pnpm -C backend build`

前端构建：

- `pnpm -C frontend build`

## 外部参考

GitHub 上的 [madaan/self-refine](https://github.com/madaan/self-refine) 将 self-refinement 归纳为“初稿、反馈、按反馈修订、按停止条件重复”。本功能采用一次闭环和规则反馈，原因是业务测试用例需要可解释、可追溯，且首期优先稳定落地。
