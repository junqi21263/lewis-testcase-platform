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
    update: {},
    create: {
      email: adminEmail,
      username: '超级管理员',
      password: hashedPwd,
      role: UserRole.SUPER_ADMIN,
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
