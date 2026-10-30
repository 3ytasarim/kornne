-- CreateEnum
CREATE TYPE "InviteKind" AS ENUM ('INVITE', 'RESET');

-- CreateEnum
CREATE TYPE "ContentState" AS ENUM ('DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BannerPlacement" AS ENUM ('HOME_STRIP', 'TOPBAR');

-- CreateEnum
CREATE TYPE "MenuLocation" AS ENUM ('HEADER', 'FOOTER_CORPORATE', 'FOOTER_LEGAL');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('BLOCKED', 'PENDING', 'SENT', 'FAILED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "PageKind" ADD VALUE 'BLOG';

-- AlterEnum
ALTER TYPE "QuoteStatus" ADD VALUE 'QUOTE_PREPARED';

-- AlterTable
ALTER TABLE "LegacyMatchSuggestion" ADD COLUMN     "note" TEXT,
ADD COLUMN     "previousRedirectTo" TEXT;

-- AlterTable
ALTER TABLE "MediaAsset" ADD COLUMN     "origin" TEXT NOT NULL DEFAULT 'legacy_import',
ADD COLUMN     "uploadedById" TEXT;

-- AlterTable
ALTER TABLE "PageTranslation" ADD COLUMN     "authorId" TEXT,
ADD COLUMN     "excerpt" TEXT,
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "publishedRevisionId" TEXT,
ADD COLUMN     "publishedSlug" TEXT,
ADD COLUMN     "state" "ContentState" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedById" TEXT;

-- AlterTable
ALTER TABLE "Price" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "evidence" TEXT,
ADD COLUMN     "note" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ProductSpec" ADD COLUMN     "source" TEXT,
ADD COLUMN     "verifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "QuoteRequest" ADD COLUMN     "assignedToId" TEXT,
ADD COLUMN     "followUpAt" TIMESTAMP(3),
ADD COLUMN     "outcome" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "UserInvite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "kind" "InviteKind" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductDocument" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "locale" "Locale",
    "title" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "publicPath" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceEvent" (
    "id" TEXT NOT NULL,
    "priceId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PageRevision" (
    "id" TEXT NOT NULL,
    "pageTranslationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "excerpt" TEXT,
    "bodyHtml" TEXT NOT NULL,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "authorId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FaqItem" (
    "id" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "question" TEXT NOT NULL,
    "answerHtml" TEXT NOT NULL,
    "productId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "state" "ContentState" NOT NULL DEFAULT 'DRAFT',
    "source" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FaqItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Banner" (
    "id" TEXT NOT NULL,
    "placement" "BannerPlacement" NOT NULL DEFAULT 'HOME_STRIP',
    "state" "ContentState" NOT NULL DEFAULT 'DRAFT',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "linkPath" TEXT,
    "mediaId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Banner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BannerTranslation" (
    "id" TEXT NOT NULL,
    "bannerId" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT,
    "ctaLabel" TEXT,

    CONSTRAINT "BannerTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItem" (
    "id" TEXT NOT NULL,
    "location" "MenuLocation" NOT NULL,
    "kind" TEXT NOT NULL,
    "pageKey" TEXT,
    "categoryKey" TEXT,
    "path" TEXT,
    "labels" JSONB NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "source" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "NotificationOutbox" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "recipient" TEXT,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'BLOCKED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "NotificationOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteNote" (
    "id" TEXT NOT NULL,
    "quoteRequestId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserInvite_tokenHash_key" ON "UserInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "UserInvite_userId_idx" ON "UserInvite"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductDocument_storageKey_key" ON "ProductDocument"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "ProductDocument_publicPath_key" ON "ProductDocument"("publicPath");

-- CreateIndex
CREATE INDEX "ProductDocument_productId_idx" ON "ProductDocument"("productId");

-- CreateIndex
CREATE INDEX "PriceEvent_priceId_idx" ON "PriceEvent"("priceId");

-- CreateIndex
CREATE INDEX "PageRevision_pageTranslationId_createdAt_idx" ON "PageRevision"("pageTranslationId", "createdAt");

-- CreateIndex
CREATE INDEX "FaqItem_locale_state_idx" ON "FaqItem"("locale", "state");

-- CreateIndex
CREATE UNIQUE INDEX "BannerTranslation_bannerId_locale_key" ON "BannerTranslation"("bannerId", "locale");

-- CreateIndex
CREATE INDEX "MenuItem_location_sortOrder_idx" ON "MenuItem"("location", "sortOrder");

-- CreateIndex
CREATE INDEX "NotificationOutbox_status_createdAt_idx" ON "NotificationOutbox"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationOutbox_kind_channel_entityId_key" ON "NotificationOutbox"("kind", "channel", "entityId");

-- CreateIndex
CREATE INDEX "QuoteNote_quoteRequestId_idx" ON "QuoteNote"("quoteRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "PageTranslation_publishedRevisionId_key" ON "PageTranslation"("publishedRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "PageTranslation_locale_publishedSlug_key" ON "PageTranslation"("locale", "publishedSlug");

-- AddForeignKey
ALTER TABLE "UserInvite" ADD CONSTRAINT "UserInvite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductDocument" ADD CONSTRAINT "ProductDocument_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Price" ADD CONSTRAINT "Price_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceEvent" ADD CONSTRAINT "PriceEvent_priceId_fkey" FOREIGN KEY ("priceId") REFERENCES "Price"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceEvent" ADD CONSTRAINT "PriceEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageTranslation" ADD CONSTRAINT "PageTranslation_publishedRevisionId_fkey" FOREIGN KEY ("publishedRevisionId") REFERENCES "PageRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageRevision" ADD CONSTRAINT "PageRevision_pageTranslationId_fkey" FOREIGN KEY ("pageTranslationId") REFERENCES "PageTranslation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FaqItem" ADD CONSTRAINT "FaqItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Banner" ADD CONSTRAINT "Banner_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BannerTranslation" ADD CONSTRAINT "BannerTranslation_bannerId_fkey" FOREIGN KEY ("bannerId") REFERENCES "Banner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteNote" ADD CONSTRAINT "QuoteNote_quoteRequestId_fkey" FOREIGN KEY ("quoteRequestId") REFERENCES "QuoteRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteNote" ADD CONSTRAINT "QuoteNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteRequest" ADD CONSTRAINT "QuoteRequest_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
