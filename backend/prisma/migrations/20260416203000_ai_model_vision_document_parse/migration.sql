-- AI 模型：文档视觉解析（图片/PDF 首页）专用配置
ALTER TABLE "ai_model_configs" ADD COLUMN IF NOT EXISTS "supportsVision" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ai_model_configs" ADD COLUMN IF NOT EXISTS "useForDocumentVisionParse" BOOLEAN NOT NULL DEFAULT false;
