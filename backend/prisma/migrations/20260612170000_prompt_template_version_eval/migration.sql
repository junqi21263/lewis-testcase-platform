-- Prompt 版本管理：模板维护当前版本，生成记录保存使用时版本快照。
ALTER TABLE "prompt_templates" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "generation_records" ADD COLUMN IF NOT EXISTS "promptTemplateVersion" INTEGER;
