-- 轻量云：解析后可删除本地 PDF 释放磁盘，保留 parsedContent
ALTER TABLE "uploaded_files" ALTER COLUMN "path" DROP NOT NULL;
ALTER TABLE "uploaded_files" ADD COLUMN "storagePurgedAt" TIMESTAMP(3);
