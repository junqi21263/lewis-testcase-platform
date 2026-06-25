-- DB-managed registration invite codes. Stores SHA-256 hashes only.

CREATE TABLE "invite_codes" (
    "id" TEXT NOT NULL,
    "codeHash" VARCHAR(64) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "createdById" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "remark" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invite_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "invite_codes_codeHash_key" ON "invite_codes"("codeHash");
CREATE INDEX "invite_codes_status_idx" ON "invite_codes"("status");
CREATE INDEX "invite_codes_createdById_idx" ON "invite_codes"("createdById");

ALTER TABLE "invite_codes" ADD CONSTRAINT "invite_codes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "email_otp_challenges" ADD COLUMN "inviteCodeId" TEXT;
CREATE INDEX "email_otp_challenges_inviteCodeId_idx" ON "email_otp_challenges"("inviteCodeId");

INSERT INTO "invite_codes" ("id", "codeHash", "status", "maxUses", "usedCount", "remark", "createdAt", "updatedAt")
VALUES (
  'default-invite-0628',
  'bd5ce2fcf52fd92709e65388151d63cefc65b75f0bbc7dcc8d401764bdfae427',
  'ACTIVE',
  NULL,
  0,
  '迁移保留：默认灰度邀请码 0628',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("codeHash") DO NOTHING;
