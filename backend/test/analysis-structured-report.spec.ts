import {
  buildAnalysisStructuredResult,
  validateAnalysisStructuredResult,
} from '../src/modules/ai/analysis-structured-report.util'

const COMPLETE_REPORT = `# 需求文档分析报告

## 1. 主要功能需求 (Functional Requirements)
- **用户登录**：支持账号密码登录。
- **订单提交**：用户可提交订单并查看状态。

## 2. 非功能需求 (Non-Functional Requirements)
- **性能**：核心接口响应时间小于 300ms。
- **安全**：密码必须加密存储。

## 3. 需求描述 (Requirement Description)
系统面向注册用户提供登录、下单、状态跟踪能力。

## 4. 补充说明 (Supplementary Notes)
需要覆盖未登录、权限不足、订单状态异常等边界。

## 5. 接口需求 (Interface Requirements)
| 模块名称 | 接口名称 | 请求方法 (Method) | 接口路径 (Path) | 简要说明 |
| --- | --- | --- | --- | --- |
| 认证 | 登录 | POST | /api/auth/login | 用户登录 |
| 订单 | 创建订单 | POST | /api/orders | 创建订单 |

## 6. 数据模型 (Data Model)
- User：id、email、passwordHash
- Order：id、userId、status

## 7. 业务流程分析 (Business Process Analysis)
\`\`\`mermaid
flowchart TD
  A[进入登录页] --> B[输入账号密码]
  B --> C{认证是否成功}
  C -->|是| D[进入订单页]
  C -->|否| E[提示错误]
\`\`\`

## 8. 风险与建议 (Risks & Mitigation)
- **高风险 (High)**：认证失败处理不一致。建议统一错误码。
- **中风险 (Medium)**：订单状态较多。建议补充状态机测试。
`

describe('analysis structured report', () => {
  it('extracts stable structured data from the markdown analysis report', () => {
    const result = buildAnalysisStructuredResult(COMPLETE_REPORT)

    expect(result.summary).toContain('系统面向注册用户')
    expect(result.functionalRequirements).toHaveLength(2)
    expect(result.nonFunctionalRequirements).toHaveLength(2)
    expect(result.interfaces).toEqual([
      {
        module: '认证',
        name: '登录',
        method: 'POST',
        path: '/api/auth/login',
        description: '用户登录',
      },
      {
        module: '订单',
        name: '创建订单',
        method: 'POST',
        path: '/api/orders',
        description: '创建订单',
      },
    ])
    expect(result.flows[0].diagram).toContain('flowchart TD')
    expect(result.risks).toEqual([
      expect.objectContaining({ level: 'high', description: expect.stringContaining('认证失败') }),
      expect.objectContaining({ level: 'medium', description: expect.stringContaining('订单状态') }),
    ])
    expect(result.quality.isPass).toBe(true)
  })

  it('marks missing required sections for auto repair', () => {
    const result = buildAnalysisStructuredResult('## 1. 主要功能需求\n- 登录')
    const quality = validateAnalysisStructuredResult(result)

    expect(quality.isPass).toBe(false)
    expect(quality.missingSections).toEqual(
      expect.arrayContaining(['nonFunctionalRequirements', 'requirementDescription', 'supplementaryNotes']),
    )
    expect(quality.repairHints.join('\n')).toContain('补齐')
  })
})
