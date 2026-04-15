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
    update: {},
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
    {
      id: 'tpl-automation-scripts',
      name: '自动化测试脚本生成模板',
      description:
        '按 PageObject / 分层接口自动化规范生成可运行脚本；生产环境推荐用 prisma/migrations/20260415120000_seed_automation_prompt_template/migration.sql 落库',
      category: TemplateCategory.CUSTOM,
      content: `# 角色
你是资深自动化测试开发工程师，精通 {{programmingLanguage}} + {{testFramework}} 自动化脚本开发，熟悉 PageObject 设计模式（UI）与分层架构（接口），代码规范严谨、可直接运行。

# 任务
基于用户提供的需求 / 接口信息 / 用例集，生成可直接运行的自动化测试工程与脚本，符合对应框架的编码规范。

# 基础信息（已由系统注入）
1. 编程语言：{{programmingLanguage}}
2. 测试框架：{{testFramework}}
3. 测试对象：{{testTarget}}
4. 用例粒度：{{granularity}}；测试类型：{{testType}}
5. 场景占比（正常/异常/边界）：{{normalPercent}}% / {{abnormalPercent}}% / {{boundaryPercent}}%
6. 说明语言：{{language}}
7. 优先级规则：{{priorityRule}}
8. 额外要求：{{extraRequirements}}

# 需求 / 用例原文
{{content}}

# 输出约定
你必须只输出一个合法 JSON 对象（不要 markdown 代码围栏），字段以系统消息为准；用 files 列出 path+content，用 meta 承载架构、依赖、环境、运行步骤、注意事项与优化建议。`,
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
