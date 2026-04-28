import { PrismaClient, UserRole, TemplateCategory } from '@prisma/client'
import * as bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 开始初始化种子数据...')
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com'
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123456'

  // 创建超级管理员
  const hashedPwd = await bcrypt.hash(adminPassword, 10)
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { emailVerified: true, username: 'admin', role: UserRole.SUPER_ADMIN },
    create: {
      email: adminEmail,
      username: 'admin',
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
        '资深测试架构师风格：带覆盖度分析 + 标准化用例表格 + 优化建议/风险提示，适用于高可执行性用例集生成',
      category: TemplateCategory.FUNCTIONAL,
      content: `# 角色
你是资深测试架构师，拥有10年+软件测试经验，精通各类测试用例设计方法，熟悉主流行业业务规则，能编写高覆盖度、高可执行性、标准化的测试用例。

# 任务
基于用户提供的【需求内容】，严格按照指定的【用例规范】，生成专业的测试用例集。

# 需求内容
{{content}}

# 用例规范
1. 测试类型：{{testType}}（如：功能测试）
2. 用例粒度：{{granularity}}（如：详细级）
3. 优先级划分：P0(核心流程必测)、P1(重要功能)、P2(次要功能)、P3(边缘场景)
4. 用例结构：每条用例必须包含【用例ID、所属模块、前置条件、测试步骤、预期结果、优先级、测试数据】7个核心字段
5. 覆盖要求：
   - 必须覆盖100%的核心需求点
   - 正常场景占比{{normalPercent}}%，异常场景占比{{abnormalPercent}}%，边界场景占比{{boundaryPercent}}%
   - 必须包含等价类划分、边界值分析、错误推测法的用例设计逻辑
6. 编写要求：
   - 测试步骤清晰可执行，无歧义，每一步只做一个操作
   - 预期结果明确可验证，无模糊描述，对应每一步操作
   - 测试数据精准匹配对应场景，包含边界值、特殊字符、异常数据
   - 用例无冗余、无重复，逻辑严谨，符合行业测试规范
   - 语言：{{language}}（如：中文）

# 输出要求
1. 先输出需求覆盖度分析，说明覆盖的需求点、未覆盖的需求点（如有）、整体覆盖度
2. 再输出结构化的测试用例表格，严格按照上述规范
3. 最后输出用例优化建议与测试风险提示
`,
      isPublic: true,
      creatorId: admin.id,
    },
    {
      id: 'tpl-automation-scripts',
      name: '自动化测试脚本生成模板（专用）',
      description:
        '资深自动化测试开发风格：指定语言/框架与测试对象，输出可运行脚本（PageObject 或分层架构）、依赖清单与运行说明',
      category: TemplateCategory.FUNCTIONAL,
      content: `# 角色
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
      description: '适用于标准功能测试用例生成，覆盖正向、逆向、边界场景',
      category: TemplateCategory.FUNCTIONAL,
      content: `请根据以下需求文档，生成完整的功能测试用例。

要求：
1. 覆盖正向流程、逆向流程、边界条件
2. 每条用例包含：标题、前置条件、测试步骤、预期结果
3. 优先级分为 P0（核心功能）、P1（重要功能）、P2（一般功能）、P3（边缘场景）
4. 输出 JSON 格式，结构如下：
{
  "cases": [
    {
      "title": "用例标题",
      "priority": "P0",
      "type": "FUNCTIONAL",
      "precondition": "前置条件",
      "steps": [{"order": 1, "action": "操作步骤", "expected": "中间预期"}],
      "expectedResult": "最终预期结果",
      "tags": ["标签"]
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
      description: '适用于 REST API 接口测试，包含请求参数、响应校验',
      category: TemplateCategory.API,
      content: `请根据以下 API 文档，生成 API 接口测试用例。

要求：
1. 覆盖正常请求、异常参数、鉴权验证、边界值
2. 包含请求方法、URL、Headers、Body、预期状态码、预期响应
3. 输出 JSON 格式，结构参考功能测试模板

API 文档：
{{content}}`,
      isPublic: true,
      creatorId: admin.id,
    },
    {
      id: 'tpl-test-expert',
      name: '测试用例生成专家（平台推荐）',
      description:
        '角色化专家：等价类/边界值/场景法；与导出列对齐（模块、标签、[n]步骤与预期）；仅 JSON',
      category: TemplateCategory.FUNCTIONAL,
      content: `# Role: 测试用例生成专家
- language: 中文
- 遵循准确性、可执行性、用例独立、可重复验证
- 熟练等价类、边界值、场景法、错误推测

## Rules（编写规范）
- 用例名称简洁（如「登录-正常登录」）
- 明确所属模块与标签（模块写入 tags 的「模块:模块名」项，另加 UI/功能测试/场景/异常等标签）
- 前置条件写清环境与数据
- 步骤一步一个动作；预期结果条数必须与步骤一致，格式强制「[1] …\\n[2] …」（与 Excel 步骤列/预期列一一对应）
- 导出六列：用例名称、所属模块、标签、前置条件、步骤描述、预期结果 — 全部通过 JSON 字段表达，勿输出表格或 Markdown

## 输出
仅输出平台约定的一个 JSON 对象（顶层 cases 数组），不要 Markdown、不要 ** 标题、不要「- 优先级:」叙述，字段用 JSON 表达。

需求/文档内容：
{{content}}`,
      isPublic: true,
      creatorId: admin.id,
    },
    {
      id: 'tpl-security',
      name: '安全测试用例模板',
      description: '覆盖常见安全漏洞场景：SQL注入、XSS、越权等',
      category: TemplateCategory.SECURITY,
      content: `请根据以下功能描述，生成安全测试用例。

覆盖以下安全场景：
1. SQL 注入攻击
2. XSS 跨站脚本
3. 越权访问（水平/垂直越权）
4. 敏感信息泄露
5. 接口重放攻击

功能描述：
{{content}}`,
      isPublic: true,
      creatorId: admin.id,
    },
  ]

  for (const tpl of templates) {
    await prisma.promptTemplate.upsert({
      where: { id: tpl.id },
      update: {},
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
