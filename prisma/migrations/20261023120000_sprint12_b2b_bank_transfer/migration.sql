-- CreateEnum
CREATE TYPE "PaymentNoticeStatus" AS ENUM ('PENDING', 'MATCHED', 'REJECTED');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "paymentMethod" TEXT;

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountHolder" TEXT NOT NULL,
    "iban" TEXT NOT NULL DEFAULT '',
    "branch" TEXT,
    "currency" CHAR(3) NOT NULL DEFAULT 'TRY',
    "active" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentNotice" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "bankAccountId" TEXT,
    "payerName" TEXT NOT NULL,
    "amountMinor" BIGINT,
    "paidAt" TIMESTAMP(3),
    "note" TEXT,
    "status" "PaymentNoticeStatus" NOT NULL DEFAULT 'PENDING',
    "ipHash" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentNotice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentNotice_status_createdAt_idx" ON "PaymentNotice"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentNotice_orderId_idx" ON "PaymentNotice"("orderId");

-- AddForeignKey
ALTER TABLE "PaymentNotice" ADD CONSTRAINT "PaymentNotice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentNotice" ADD CONSTRAINT "PaymentNotice_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
