-- 内置：自动化测试脚本生成提示词模板（可通过 migrate deploy 落库，也可单独在 psql 中执行本文件）
-- creatorId 固定为 '0'：需存在对应 users 行以满足外键（下方自动插入占位用户，若已存在则跳过）

INSERT INTO "users" (
  "id",
  "email",
  "username",
  "password",
  "role",
  "emailVerified",
  "createdAt",
  "updatedAt"
) VALUES (
  '0',
  'built-in-template-creator@system.local',
  'system-template',
  '$2a$10$BuiltInTemplateCreatorNoLogin',
  'SUPER_ADMIN'::"UserRole",
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO NOTHING;

DO $$
DECLARE
  tmpl_name TEXT := '自动化测试脚本生成模板';
  tmpl_id TEXT := 'tpl-automation-scripts';
  tmpl_desc TEXT := '按 PageObject / 分层接口自动化规范生成可运行脚本：架构说明、依赖、分文件代码、运行步骤（输出由系统约定为 JSON，后端再落为用例集）';
  tmpl_variables JSONB := '[
    {"name":"programmingLanguage","description":"编程语言，如 Python","required":false},
    {"name":"testFramework","description":"测试框架，如 Pytest / Playwright","required":false},
    {"name":"testTarget","description":"测试对象：接口或 UI 功能等","required":false},
    {"name":"extraRequirements","description":"额外要求，如 Allure、CI/CD","required":false},
    {"name":"content","description":"需求原文或结构化用例集（由输入来源注入）","required":true}
  ]'::jsonb;
  tmpl_content TEXT := $tpl$# 角色
你是资深自动化测试开发工程师，精通 {{programmingLanguage}} + {{testFramework}} 自动化脚本开发，熟悉 PageObject 设计模式（UI）与分层架构（接口），代码规范严谨、可直接运行。

# 任务
基于用户提供的需求 / 接口信息 / 用例集，生成可直接运行的自动化测试工程与脚本，符合对应框架的编码规范。

# 基础信息（已由系统注入，可在正文中引用）
1. 编程语言：{{programmingLanguage}}
2. 测试框架：{{testFramework}}
3. 测试对象：{{testTarget}}
4. 用例粒度参考：{{granularity}}；测试类型上下文：{{testType}}
5. 场景占比参考（正常/异常/边界）：{{normalPercent}}% / {{abnormalPercent}}% / {{boundaryPercent}}%
6. 输出语言说明：{{language}}
7. 优先级规则（若适用）：{{priorityRule}}
8. 额外要求：{{extraRequirements}}

# 脚本规范
1. 代码架构：UI 采用 PageObject；接口采用分层（client / service / case）、封装公共方法、基础类与断言工具
2. 用例管理：按模块拆分测试文件，命名清晰，支持 pytest 标记（如 @pytest.mark.smoke）或等价机制以便按标签筛选
3. 核心要求：
   - 脚本可直接运行，无语法错误，依赖在 requirements.txt 或 pyproject 中明确
   - 包含 setup / teardown 或 fixture，以及必要的数据清理
   - 断言充分；UI 失败需预留截图钩子（如 allure.attach 或框架等价写法）
   - 关键逻辑参数化，支持多组数据驱动
   - 对不稳定点使用有限次重试或显式等待（避免死等）
   - 注释说明关键设计决策
4. 需求 / 用例原文（占位，系统会在文末再次附上输入全文）：
{{content}}

# 输出约定（与系统消息一致，必须遵守）
你必须只输出**一个合法 JSON 对象**（不要 markdown 代码围栏），顶层字段由系统消息定义；其中用 `files` 列出每个源码文件的 `path` 与 `content`，用 `meta` 承载架构说明、依赖清单、环境要求、运行步骤、注意事项与优化建议。
$tpl$;
BEGIN
  INSERT INTO "prompt_templates" (
    "id",
    "name",
    "description",
    "category",
    "content",
    "variables",
    "isPublic",
    "usageCount",
    "creatorId",
    "createdAt",
    "updatedAt"
  ) VALUES (
    tmpl_id,
    tmpl_name,
    tmpl_desc,
    'CUSTOM'::"TemplateCategory",
    tmpl_content,
    tmpl_variables,
    true,
    0,
    '0',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT ("id") DO UPDATE SET
    "name" = EXCLUDED."name",
    "description" = EXCLUDED."description",
    "category" = EXCLUDED."category",
    "content" = EXCLUDED."content",
    "variables" = EXCLUDED."variables",
    "isPublic" = EXCLUDED."isPublic",
    "creatorId" = '0',
    "updatedAt" = CURRENT_TIMESTAMP;
END $$;
