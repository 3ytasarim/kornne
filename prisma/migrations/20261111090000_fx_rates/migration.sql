-- USD price entry with TL display (TCMB rates) — additive only
CREATE TABLE "FxRate" (
    "currency" CHAR(3) NOT NULL,
    "rate4" INTEGER NOT NULL,
    "bulletinDate" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'TCMB',
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FxRate_pkey" PRIMARY KEY ("currency")
);
ALTER TABLE "Order" ADD COLUMN "fxCurrency" CHAR(3);
ALTER TABLE "Order" ADD COLUMN "fxRate4" INTEGER;
