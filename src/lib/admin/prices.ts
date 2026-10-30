import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { parseMinor } from "@/lib/money";
import { AdminError } from "./action-state";

/**
 * Price center (docs/admin/catalog-pricing-workflow.md).
 *  - Price rows are append-only history. The 41 imported legacy rows stay UNVERIFIED forever; they are never
 *    "approved" in place — an editor enters a NEW admin proposal (amount, VAT, currency, validity, evidence).
 *  - Four-eyes: the approver must be a different user than the proposer.
 *  - No bulk approval exists anywhere (no API, no UI).
 *  - A VERIFIED price only changes what the storefront DISPLAYS. Buying stays impossible until every commercial
 *    gate in src/lib/commerce/gate.ts is satisfied (separate, env-level decision).
 */
export type Actor = { id: string };

const dateInput = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? new Date(`${v}T00:00:00+03:00`) : undefined))
  .refine((d) => d === undefined || !Number.isNaN(d.getTime()), "Geçerli bir tarih girin.");

export const proposalSchema = z
  .object({
    productId: z.string().min(10).max(40),
    amount: z.string().trim().min(1, "Satış fiyatını girin."),
    compareAt: z.string().trim().optional(),
    currency: z.enum(["TRY"], { message: "Şimdilik yalnız TRY desteklenir." }),
    vatMode: z.enum(["included", "excluded"], { message: "KDV dahil mi hariç mi seçin." }),
    vatRate: z.string().trim().min(1, "KDV oranını girin."),
    validFrom: dateInput,
    validTo: dateInput,
    evidence: z.string().trim().min(5, "Fiyatın kaynağını yazın (örn. müşteri fiyat listesi, tarih).").max(300),
    note: z.string().trim().max(1000).optional(),
  })
  .transform((v, ctx) => {
    const amountMinor = parseMinor(v.amount);
    if (amountMinor === null || amountMinor <= 0n) ctx.addIssue({ code: "custom", path: ["amount"], message: "Geçerli bir tutar girin (örn. 1.250.000,00)." });
    else if (amountMinor > 100_000_000_000n) ctx.addIssue({ code: "custom", path: ["amount"], message: "Tutar makul aralığın dışında." });
    let compareAtMinor: bigint | null = null;
    if (v.compareAt) {
      compareAtMinor = parseMinor(v.compareAt);
      if (compareAtMinor === null) ctx.addIssue({ code: "custom", path: ["compareAt"], message: "Geçerli bir tutar girin." });
      else if (amountMinor !== null && compareAtMinor <= amountMinor) ctx.addIssue({ code: "custom", path: ["compareAt"], message: "Eski fiyat satış fiyatından yüksek olmalı; aksi hâlde boş bırakın (indirim gösterilmez)." });
    }
    const rate = vatRateToBp(v.vatRate);
    if (rate === null) ctx.addIssue({ code: "custom", path: ["vatRate"], message: "KDV oranı 0 ile 100 arasında olmalı (örn. 20)." });
    if (v.validFrom && v.validTo && v.validTo <= v.validFrom) ctx.addIssue({ code: "custom", path: ["validTo"], message: "Bitiş tarihi başlangıçtan sonra olmalı." });
    return { ...v, amountMinor: amountMinor ?? 0n, compareAtMinor, vatRateBp: rate ?? 0 };
  });

/** "20" | "20,5" | "%8" → basis points (2000, 2050, 800); null if out of range. */
export function vatRateToBp(input: string): number | null {
  const s = input.replace(/[%\s]/g, "").replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return null;
  const [w, f = ""] = s.split(".");
  const bp = Number(w) * 100 + Number(f.padEnd(2, "0"));
  return bp >= 0 && bp <= 10_000 ? bp : null;
}

type Db = PrismaClient | Prisma.TransactionClient;

async function event(db: Db, priceId: string, action: string, actorId: string, note?: string | null) {
  await db.priceEvent.create({ data: { priceId, action, actorId, note: note || null } });
}
async function audit(db: Db, actorId: string, action: string, priceId: string, after: Record<string, unknown>) {
  await db.auditLog.create({ data: { actorId, action, entityType: "Price", entityId: priceId, after: JSON.parse(JSON.stringify(after, (_k, v) => (typeof v === "bigint" ? v.toString() : v))) } });
}

export async function proposePrice(db: PrismaClient, actor: Actor, raw: unknown) {
  const v = proposalSchema.parse(raw);
  const product = await db.product.findUnique({ where: { id: v.productId }, select: { id: true } });
  if (!product) throw new AdminError("Ürün bulunamadı.");
  return db.$transaction(async (tx) => {
    const price = await tx.price.create({
      data: {
        productId: v.productId,
        currency: v.currency,
        amountMinor: v.amountMinor,
        compareAtMinor: v.compareAtMinor,
        vatIncluded: v.vatMode === "included",
        vatRateBp: v.vatRateBp,
        validFrom: v.validFrom ?? new Date(),
        validTo: v.validTo ?? null,
        source: "ADMIN",
        status: "UNVERIFIED",
        createdById: actor.id,
        evidence: v.evidence,
        note: v.note || null,
      },
    });
    await event(tx, price.id, "proposed", actor.id, v.note);
    await audit(tx, actor.id, "price.proposed", price.id, { productId: v.productId, amountMinor: v.amountMinor, compareAtMinor: v.compareAtMinor, vatIncluded: v.vatMode === "included", vatRateBp: v.vatRateBp, evidence: v.evidence });
    return price;
  });
}

export async function approvePrice(db: PrismaClient, actor: Actor, priceId: string, note?: string) {
  return db.$transaction(async (tx) => {
    const p = await tx.price.findUnique({ where: { id: priceId } });
    if (!p) throw new AdminError("Fiyat kaydı bulunamadı.");
    if (p.source === "LEGACY_IMPORT") throw new AdminError("Eski siteden aktarılan ham fiyat doğrudan onaylanamaz. KDV ve kaynak bilgisiyle yeni bir fiyat önerisi girin.");
    if (p.status !== "UNVERIFIED") throw new AdminError("Bu öneri zaten karara bağlanmış.");
    if (!p.createdById || p.createdById === actor.id) throw new AdminError("Kendi girdiğiniz fiyatı onaylayamazsınız (dört göz kuralı). Başka bir yetkili onaylamalı.");
    if (p.vatIncluded === null || p.vatRateBp === null || !p.evidence) throw new AdminError("KDV durumu, oranı ve kaynağı eksik olan fiyat onaylanamaz.");
    if (p.compareAtMinor !== null && p.compareAtMinor <= p.amountMinor) throw new AdminError("Eski fiyat satış fiyatından yüksek değil; geçersiz indirim onaylanamaz.");
    const now = new Date();
    const done = await tx.price.updateMany({ where: { id: p.id, status: "UNVERIFIED" }, data: { status: "VERIFIED", approvedById: actor.id, approvedAt: now } });
    if (done.count !== 1) throw new AdminError("Bu öneri aynı anda başka biri tarafından karara bağlandı. Sayfayı yenileyin.");
    // previously verified prices of the same product/variant end now (history kept)
    const previous = await tx.price.findMany({ where: { productId: p.productId, variantId: p.variantId, status: "VERIFIED", id: { not: p.id }, OR: [{ validTo: null }, { validTo: { gt: now } }] }, select: { id: true } });
    for (const old of previous) {
      await tx.price.update({ where: { id: old.id }, data: { validTo: now } });
      await event(tx, old.id, "superseded", actor.id, `yerini ${p.id} aldı`);
    }
    await event(tx, p.id, "approved", actor.id, note);
    await audit(tx, actor.id, "price.approved", p.id, { productId: p.productId, amountMinor: p.amountMinor, superseded: previous.map((x) => x.id) });
    return p.productId;
  });
}

/** Reject a pending proposal (approver) or withdraw one's own proposal (proposer). */
export async function rejectPrice(db: PrismaClient, actor: Actor & { canApprove: boolean }, priceId: string, note: string) {
  if (note.trim().length < 3) throw new AdminError("Ret gerekçesini yazın.", { note: "Gerekçe zorunlu." });
  return db.$transaction(async (tx) => {
    const p = await tx.price.findUnique({ where: { id: priceId } });
    if (!p || p.source === "LEGACY_IMPORT") throw new AdminError("Yalnız yönetici fiyat önerileri reddedilebilir.");
    if (p.status !== "UNVERIFIED") throw new AdminError("Bu öneri zaten karara bağlanmış.");
    if (!actor.canApprove && p.createdById !== actor.id) throw new AdminError("Başkasının önerisini yalnız onay yetkilisi reddedebilir.");
    const done = await tx.price.updateMany({ where: { id: p.id, status: "UNVERIFIED" }, data: { status: "REJECTED" } });
    if (done.count !== 1) throw new AdminError("Bu öneri aynı anda karara bağlandı. Sayfayı yenileyin.");
    await event(tx, p.id, p.createdById === actor.id && !actor.canApprove ? "withdrawn" : "rejected", actor.id, note);
    await audit(tx, actor.id, "price.rejected", p.id, { productId: p.productId, note });
    return p.productId;
  });
}

/** Take back a verified price ("geri alma"): the storefront returns to "price on request"; the row stays. */
export async function revokePrice(db: PrismaClient, actor: Actor, priceId: string, note: string) {
  if (note.trim().length < 3) throw new AdminError("Geri alma gerekçesini yazın.", { note: "Gerekçe zorunlu." });
  return db.$transaction(async (tx) => {
    const p = await tx.price.findUnique({ where: { id: priceId } });
    if (!p || p.status !== "VERIFIED") throw new AdminError("Yalnız onaylı fiyat geri alınabilir.");
    const now = new Date();
    const done = await tx.price.updateMany({ where: { id: p.id, status: "VERIFIED" }, data: { status: "REJECTED", validTo: now } });
    if (done.count !== 1) throw new AdminError("Fiyat aynı anda değişti. Sayfayı yenileyin.");
    await event(tx, p.id, "revoked", actor.id, note);
    await audit(tx, actor.id, "price.revoked", p.id, { productId: p.productId, note });
    return p.productId;
  });
}

/** Facts for the price list (raw legacy value, latest admin proposal, live verified price). */
export function livePrice<T extends { status: string; validFrom: Date; validTo: Date | null }>(rows: T[], now = new Date()): T | null {
  return rows.filter((r) => r.status === "VERIFIED" && r.validFrom <= now && (!r.validTo || r.validTo > now)).sort((a, b) => +b.validFrom - +a.validFrom)[0] ?? null;
}

/**
 * Simple price update from the product page (client request 30.10.2026: "fiyat ürünün içinde olsun"). For users with
 * price-approval rights the new price goes live at once: it is stored as a new history row (proposed + approved by
 * the same actor, recorded as "direct"), the previous live price ends now, everything is audit-logged. Editors without
 * approval rights keep the proposal flow (proposePrice).
 */
export const directPriceSchema = z
  .object({
    productId: z.string().min(10).max(40),
    amount: z.string().trim().min(1, "Satış fiyatını girin."),
    vatMode: z.enum(["included", "excluded"], { message: "KDV dahil mi hariç mi seçin." }),
    vatRate: z.string().trim().min(1, "KDV oranını girin."),
    note: z.string().trim().max(300).optional(),
  })
  .transform((v, ctx) => {
    const amountMinor = parseMinor(v.amount);
    if (amountMinor === null || amountMinor <= 0n) ctx.addIssue({ code: "custom", path: ["amount"], message: "Geçerli bir tutar girin (örn. 1.250.000,00)." });
    else if (amountMinor > 100_000_000_000n) ctx.addIssue({ code: "custom", path: ["amount"], message: "Tutar makul aralığın dışında." });
    const rate = vatRateToBp(v.vatRate);
    if (rate === null) ctx.addIssue({ code: "custom", path: ["vatRate"], message: "KDV oranı 0 ile 100 arasında olmalı (örn. 20)." });
    return { ...v, amountMinor: amountMinor ?? 0n, vatRateBp: rate ?? 0 };
  });

export async function setPriceDirect(db: PrismaClient, actor: Actor, raw: unknown) {
  const v = directPriceSchema.parse(raw);
  const product = await db.product.findUnique({ where: { id: v.productId }, select: { id: true } });
  if (!product) throw new AdminError("Ürün bulunamadı.");
  return db.$transaction(async (tx) => {
    const now = new Date();
    const evidence = "Ürün sayfasından güncellendi";
    const price = await tx.price.create({
      data: { productId: v.productId, currency: "TRY", amountMinor: v.amountMinor, compareAtMinor: null, vatIncluded: v.vatMode === "included", vatRateBp: v.vatRateBp, validFrom: now, source: "ADMIN", status: "VERIFIED", createdById: actor.id, approvedById: actor.id, approvedAt: now, evidence, note: v.note || null },
    });
    const previous = await tx.price.findMany({ where: { productId: v.productId, variantId: null, status: "VERIFIED", id: { not: price.id }, OR: [{ validTo: null }, { validTo: { gt: now } }] }, select: { id: true } });
    for (const old of previous) {
      await tx.price.update({ where: { id: old.id }, data: { validTo: now } });
      await event(tx, old.id, "superseded", actor.id, `yerini ${price.id} aldı`);
    }
    await event(tx, price.id, "approved", actor.id, v.note || "doğrudan güncelleme (ürün sayfası)");
    await audit(tx, actor.id, "price.set_direct", price.id, { productId: v.productId, amountMinor: v.amountMinor, vatIncluded: v.vatMode === "included", vatRateBp: v.vatRateBp, superseded: previous.map((x) => x.id) });
    return price;
  });
}
