-- Admin ops audit trail (SUPER_ADMIN password reset / role changes). Never stores plaintext passwords.

CREATE TABLE "admin_audit_logs" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "action" VARCHAR(64) NOT NULL,
    "detail" JSONB,
    "ip" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "admin_audit_logs_createdAt_idx" ON "admin_audit_logs"("createdAt");
CREATE INDEX "admin_audit_logs_targetUserId_idx" ON "admin_audit_logs"("targetUserId");
CREATE INDEX "admin_audit_logs_operatorId_idx" ON "admin_audit_logs"("operatorId");

ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
