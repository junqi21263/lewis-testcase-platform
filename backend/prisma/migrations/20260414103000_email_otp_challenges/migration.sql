-- CreateEnum
CREATE TYPE "EmailOtpPurpose" AS ENUM ('REGISTER', 'PASSWORD_RESET');

-- CreateTable
CREATE TABLE "email_otp_challenges" (
    "id" TEXT NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "purpose" "EmailOtpPurpose" NOT NULL,
    "codeHash" VARCHAR(255) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "username" VARCHAR(50),
    "passwordHash" VARCHAR(255),
    "avatar" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_otp_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_otp_challenges_email_purpose_key" ON "email_otp_challenges"("email", "purpose");
