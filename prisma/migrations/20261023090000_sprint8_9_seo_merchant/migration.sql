-- AlterTable
ALTER TABLE "MerchantSyncRun" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "status" TEXT;

-- CreateTable
CREATE TABLE "SeoAuditRun" (
    "id" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "urlCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "results" JSONB,
    "createdById" TEXT,

    CONSTRAINT "SeoAuditRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SeoAuditRun_startedAt_idx" ON "SeoAuditRun"("startedAt");
