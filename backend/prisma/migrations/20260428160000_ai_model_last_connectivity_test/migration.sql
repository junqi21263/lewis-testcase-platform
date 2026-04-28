-- 记录 AI 模型最近一次连通性测试结果（管理员「测试」按钮）
ALTER TABLE "ai_model_configs" ADD COLUMN IF NOT EXISTS "lastTestAt" TIMESTAMP(3);
ALTER TABLE "ai_model_configs" ADD COLUMN IF NOT EXISTS "lastTestOk" BOOLEAN;
ALTER TABLE "ai_model_configs" ADD COLUMN IF NOT EXISTS "lastTestLatencyMs" INTEGER;
ALTER TABLE "ai_model_configs" ADD COLUMN IF NOT EXISTS "lastTestError" VARCHAR(500);
