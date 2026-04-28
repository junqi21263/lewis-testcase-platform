import { PrismaClient, UserRole, TemplateCategory } from '@prisma/client'
import * as bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 开始初始化种子数据...')
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com'
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123456'

  // 创建超级管理员
  const hashedPwd = await bcrypt.hash(adminPassword, 10)

  const existingByEmail = await prisma.user.findUnique({ where: { email: adminEmail } })
  let adminUsername = 'admin'
  if (!existingByEmail) {
    const usernameTaken = await prisma.user.findFirst({ where: { username: adminUsername } })
    if (usernameTaken) {
      const suffix = String(Date.now()).slice(-6)
      adminUsername = `admin_${suffix}`
    }
  }

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    // 注意：不要强制覆盖 username，避免与已有用户冲突（username 唯一）
    update: { emailVerified: true, role: UserRole.SUPER_ADMIN },
    create: {
      email: adminEmail,
      username: adminUsername,
      password: hashedPwd,
      role: UserRole.SUPER_ADMIN,
      emailVerified: true,
    },
  })
  console.log('✅ 管理员账号创建成功:', admin.email)

  // 创建测试用团队
  const team = await prisma.team.upsert({
    where: { id: 'default-team' },
    update: {},
    create: {
      id: 'default-team',
      name: '默认团队',
      description: '系统默认团队',
      ownerId: admin.id,
      members: {
        create: { userId: admin.id, role: UserRole.SUPER_ADMIN },
      },
    },
  })
  console.log('✅ 默认团队创建成功:', team.name)

  // 创建内置 AI 模型配置
  await prisma.aIModelConfig.upsert({
    where: { id: 'gpt-4o-default' },
    update: {
      supportsVision: true,
      useForDocumentVisionParse: true,
    },
    create: {
      id: 'gpt-4o-default',
      name: 'GPT-4o',
      provider: 'OpenAI',
      modelId: 'gpt-4o',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'placeholder',
      isDefault: true,
      maxTokens: 4096,
      temperature: 0.7,
      supportsVision: true,
      useForDocumentVisionParse: true,
    },
  })
  console.log('✅ 默认 AI 模型配置创建成功')

  // 创建内置提示词模板
  const templates = [
    {
      id: 'tpl-pro-testcases',
      name: '专业测试用例生成模板（规范版）',
      description:
        '资深测试架构师风格；与平台导出一致：仅 JSON、六列、等价类/边界/场景覆盖；占位符可手改',
      category: TemplateCategory.FUNCTIONAL,
      content: `# 角色
你是资深测试架构师，10年+ 经验，精通等价类、边界值、场景法、错误推测，输出高覆盖、可执行、可评审的用例。

# 任务
基于下方【需求内容】生成测试用例。**只输出一个 JSON 对象**（顶层键 "cases"），与平台系统提示一致；禁止 Markdown、表格、代码围栏、文前文末说明。

# 参数（可替换占位符）
- 测试类型：{{testType}}（默认：功能测试）
- 粒度：{{granularity}}（默认：详细）
- 语言：{{language}}（默认：中文）
- 场景占比建议：正常 {{normalPercent}}% / 异常 {{abnormalPercent}}% / 边界 {{boundaryPercent}}%

# 用例规范（映射 Excel 六列）
- title：用例名称（简洁，如「模块-场景-结果」）
- tags：须含「模块:所属模块名」；其余为 UI、功能、场景、异常 等短标签
- precondition：多条用「1. …\\n2. …」
- steps：order 从 1 递增，每步 action 仅一个操作
- expectedResult：**必须与步骤条数一致**，格式「[1] …\\n[2] …」逐步对应
- priority：P0–P3；type：FUNCTIONAL 等枚举

# 需求内容
{{content}}
`,
      isPublic: true,
      creatorId: admin.id,
    },
    {
      id: 'tpl-automation-scripts',
      name: '自动化测试脚本生成模板（专用）',
      description:
        '输出可运行自动化脚本（非 JSON 用例）；若仅需用例导出请选「测试用例生成专家」或功能模板',
      category: TemplateCategory.FUNCTIONAL,
      content: `# 说明
本模板用于生成**自动化脚本与工程结构**，不是平台的 JSON 测试用例格式。若当前任务是用例集导出 Excel，请换用「测试用例生成专家」或「功能测试用例模板」。

# 角色
你是资深自动化测试开发工程师，精通 {{programmingLanguage}}（如：Python）与 {{testFramework}}（如：Pytest）自动化脚本开发，熟悉 PageObject 设计模式，代码规范严谨，可直接运行。

# 任务
基于用户提供的需求/接口信息/用例集，生成可直接运行的自动化测试脚本，符合对应框架的编码规范。

# 基础信息
1. 编程语言：{{programmingLanguage}}
2. 测试框架：{{testFramework}}
3. 测试对象：{{testTarget}}（接口 / UI 功能等）
4. 需求/用例内容：{{content}}

# 脚本规范
1. 代码架构：采用 PageObject 设计模式（UI 自动化）/ 分层架构（接口自动化），封装公共方法、基础类、断言工具
2. 用例管理：按模块拆分测试用例文件，用例命名规范，支持按标签/优先级筛选执行
3. 核心要求：
   - 脚本可直接运行，无语法错误，依赖包明确
   - 包含前置 setup、后置 teardown 处理，数据清理逻辑
   - 完善的断言机制，失败截图/日志留存
   - 参数化处理，支持多组测试数据驱动
   - 异常捕获与重试机制，提升脚本稳定性
   - 注释清晰，关键逻辑有详细说明
   - 符合对应语言的官方编码规范
4. 额外要求：{{extraRequirements}}（如：生成 Allure 报告、集成 CI/CD；无则写「无」）

# 输出要求
1. 先输出脚本架构说明、依赖包清单、运行环境要求
2. 按文件拆分输出完整的代码，包含公共封装类、测试用例文件、配置文件
3. 最后输出脚本运行步骤、注意事项与优化建议
`,
      isPublic: true,
      creatorId: admin.id,
    },
    {
      id: 'tpl-functional',
      name: '功能测试用例模板',
      description: '标准功能测试；正向/逆向/边界；仅 JSON；六列导出（模块、标签、[n] 预期）',
      category: TemplateCategory.FUNCTIONAL,
      content: `请根据以下需求生成功能测试用例。**仅输出 JSON**（无 Markdown），顶层 "cases" 数组。

要求：
1. 覆盖正向、逆向、边界；步骤一步一动作；预期与步骤一一对应。
2. tags 必须包含「模块:模块名」，可加 UI、功能、场景、异常 等。
3. precondition 多条请用「1. …\\n2. …」；expectedResult 必须用「[1]…\\n[2]…」与 steps 条数一致。

结构示例：
{
  "cases": [
    {
      "title": "登录-正确密码登录成功",
      "priority": "P0",
      "type": "FUNCTIONAL",
      "precondition": "1. 用户已注册\\n2. 未登录",
      "steps": [
        {"order": 1, "action": "输入正确账号密码", "expected": ""},
        {"order": 2, "action": "点击登录", "expected": ""}
      ],
      "expectedResult": "[1] 校验通过\\n[2] 登录成功进入首页",
      "tags": ["模块:用户登录", "UI", "功能"]
    }
  ]
}

需求文档内容：
{{content}}`,
      isPublic: true,
      creatorId: admin.id,
    },
    {
      id: 'tpl-api',
      name: 'API 接口测试用例模板',
      description: 'REST/API；正常/异常/鉴权/边界；仅 JSON；步骤可写请求要点，预期写状态码与响应要点',
      category: TemplateCategory.API,
      content: `请根据以下 API 文档生成接口测试用例。**仅输出 JSON**，顶层 "cases"。

要求：
1. 覆盖正常请求、异常参数、鉴权失败、边界值。
2. 每条用例：title 体现接口与场景；tags 含「模块:服务或资源名」，可加 功能、异常、鉴权 等。
3. steps 中 action 描述方法、路径、关键 Header/Body/参数；expectedResult 用 [1][2] 对应每步，写明状态码与关键响应字段。
4. precondition 写明鉴权、测试数据、环境。

字段与功能模板相同：title, priority, type, precondition, steps[], expectedResult, tags。

API 文档：
{{content}}`,
      isPublic: true,
      creatorId: admin.id,
    },
    {
      id: 'tpl-test-expert',
      name: '测试用例生成专家（平台推荐）',
      description:
        '专家角色 + Workflows；六列导出；强制 模块: 与 [n] 预期；流式/非流式均适用',
      category: TemplateCategory.FUNCTIONAL,
      content: `# Role: 测试用例生成专家
- language: 中文
- 细致严谨；准确性、可执行性、用例独立、可重复验证
- 熟练等价类、边界值、场景法、错误推测

## Workflows
1. 分析需求：功能点、主流程、异常与边界。
2. 设计用例：正常 / 异常 / 边界；优先级 P0–P3。
3. 按平台字段输出：**仅一个 JSON 对象**，键为 "cases" 的数组；每条对应 Excel 一行。

## Rules（与导出六列对齐）
- title → 用例名称（例：登录-正确邮箱密码登录成功）
- tags → 必有「模块:xxx」；其余短标签：UI、功能、场景、异常（勿长句）
- precondition → 多条用「1. …\\n2. …」
- steps → order 连续；每步 action 单一动作
- expectedResult → **条数必须与 steps 相同**；格式「[1] …\\n[2] …」逐步对应
- 禁止 Markdown、加粗标题、代码围栏、「- 优先级:」类非 JSON 叙述

## 输出
只输出 JSON，第一个非空白字符为 { 。无任何前后说明文字。

需求/文档内容：
{{content}}`,
      isPublic: true,
      creatorId: admin.id,
    },
    {
      id: 'tpl-security',
      name: '安全测试用例模板',
      description: 'SQL 注入、XSS、越权、泄露、重放；仅 JSON；tags 建议含模块:与安全类型',
      category: TemplateCategory.SECURITY,
      content: `请根据以下功能描述生成**安全测试用例**。**仅输出 JSON**，顶层 "cases"。

尽量覆盖：
1. SQL 注入
2. XSS
3. 越权（水平/垂直）
4. 敏感信息泄露
5. 接口重放 / 重放攻击

每条用例：title 标明攻击面；tags 含「模块:业务模块」及 安全、注入、XSS 等；precondition 写明账号角色与工具假设；steps 为可复现操作；expectedResult 用 [1][2] 与步骤对应，描述阻断或修复表现。

功能描述：
{{content}}`,
      isPublic: true,
      creatorId: admin.id,
    },
  ]

  for (const tpl of templates) {
    const { id, name, description, category, content, isPublic } = tpl
    await prisma.promptTemplate.upsert({
      where: { id },
      update: { name, description, category, content, isPublic },
      create: { ...tpl, variables: [] },
    })
  }
  console.log(`✅ ${templates.length} 个提示词模板创建成功`)

  console.log('\n🎉 种子数据初始化完成！')
  console.log(`📧 管理员账号: ${adminEmail}`)
  console.log(`🔑 管理员密码: ${adminPassword}`)
}

main()
  .catch((e) => {
    console.error('❌ 种子数据初始化失败:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
