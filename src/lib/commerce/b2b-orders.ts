import { createHash, randomBytes, randomInt } from "node:crypto";
import { Prisma, type Locale as DbLocale, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { AdminError } from "@/lib/admin/action-state";
import { writeAuditLogVia } from "@/lib/audit-log";
import { LOCALES } from "@/lib/i18n/config";
import type { GateResult } from "./gate";
import { assertTransition, type Actor, type OrderState } from "./order-state";
import { convertMinor, displayCurrency, type Rates } from "@/lib/fx/convert";
import { getRates } from "@/lib/fx/rates";
import { isValidTrIban } from "./iban";
import { shippingFor } from "./shipping";
import { computeTotals, lineTotals, MAX_LINE_QTY } from "./totals";

/**
 * B2B orders paid by EFT / Havale (Sprint 12). Business rules:
 *  - prices, VAT and totals are ALWAYS recomputed from VERIFIED database prices (never from the client)
 *  - order is created directly in AWAITING_PAYMENT with a human-readable reference for the transfer description
 *  - the customer can only NOTIFY a payment (legacy /odeme-bildirimi); an admin confirms the incoming transfer
 *  - status lookup needs order number + e-mail (an order number alone reveals nothing)
 *  - idempotent submission, honeypot + minimum fill time, per-IP and per-e-mail limits
 */
type Db = PrismaClient;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const clean = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
const text = (min: number, max: number, code = "required") => z.string().max(max * 2).transform(clean).pipe(z.string().min(min, code).max(max, "tooLong"));
const optional = (max: number) => z.string().max(max * 2).optional().transform((v) => (v ? clean(v) : "") || null);

export const ORDER_LIMITS = { maxLines: 50, minFillMs: 3_000, maxFormAgeMs: 24 * 3_600_000, perIpPerHour: 5, perEmailPerHour: 5, noticesPerIpPerHour: 10, lookupsPerIpPerHour: 30 } as const;

const item = z.object({ productRef: z.string().regex(/^\d{1,8}$/), variantId: z.string().regex(/^[a-z0-9]{10,40}$/).nullable().optional().transform((v) => v ?? null), quantity: z.number().int().min(1).max(MAX_LINE_QTY) });

export const b2bCheckoutSchema = z
  .object({
  locale: z.enum(LOCALES),
  company: text(2, 160),
  /** required on Turkish orders only — foreign companies have no Turkish tax office */
  taxOffice: text(0, 80),
  /** Turkish orders: VKN (10) for companies, TCKN (11) for sole proprietors. Foreign orders: any company tax / VAT ID. */
  taxNumber: z.string().max(80).transform((v) => v.replace(/\s/g, "").toUpperCase()).pipe(z.string().regex(/^[A-Z0-9][A-Z0-9./-]{3,29}$/, "invalidTaxNumber")),
  contactName: text(2, 120),
  email: z.string().trim().toLowerCase().pipe(z.email("invalidEmail")),
  phone: z.string().transform(clean).refine((v) => /^[+0-9 ()-]{7,25}$/.test(v) && v.replace(/\D/g, "").length >= 10, "invalidPhone"),
  city: text(2, 60),
  district: text(2, 60),
  address: text(10, 400),
  shippingSame: z.boolean().default(true),
  shippingAddress: optional(400),
  note: optional(1000),
  acceptTerms: z.literal(true, "acceptTerms"),
  items: z.array(item).min(1, "items").max(ORDER_LIMITS.maxLines, "items"),
  idempotencyKey: z.uuid(),
  website: z.string().max(200).optional(),
  startedAt: z.number().int(),
  })
  .superRefine((v, ctx) => {
    if (v.locale === "tr") {
      if (v.taxOffice.length < 2) ctx.addIssue({ code: "custom", path: ["taxOffice"], message: "required" });
      if (!/^\d{10,11}$/.test(v.taxNumber)) ctx.addIssue({ code: "custom", path: ["taxNumber"], message: "invalidTaxNumber" });
    }
  });
export type B2BCheckoutInput = z.input<typeof b2bCheckoutSchema>;
export type PlaceOrderResult = { ok: true; number: string; accessToken: string; totalMinor: bigint; currency: string; duplicate: boolean } | { ok: false; code: "validation"; fields: Record<string, string> } | { ok: false; code: "spam" | "rate" | "closed" | "not_purchasable" | "no_account" | "error" };

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function newOrderNumber(now = new Date()): string {
  const d = now.toISOString().slice(2, 10).replace(/-/g, "");
  let r = "";
  for (let i = 0; i < 5; i++) r += ALPHABET[randomInt(ALPHABET.length)];
  return `KRN-${d}-${r}`;
}

async function limited(db: Db, key: string, max: number, windowMs: number) {
  const n = await db.loginAttempt.count({ where: { key, createdAt: { gte: new Date(Date.now() - windowMs) } } });
  if (n >= max) return true;
  await db.loginAttempt.create({ data: { key } });
  return false;
}

/** Currently valid VERIFIED price with VAT treatment (same rule as the storefront) — null = not purchasable. */
async function purchasable(db: Db | Prisma.TransactionClient, productId: string, variantId: string | null, now: Date) {
  return db.price.findFirst({ where: { productId, variantId, status: "VERIFIED", vatIncluded: { not: null }, vatRateBp: { not: null }, validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gt: now } }] }, orderBy: { validFrom: "desc" } });
}

export type CartItemInput = { productRef: string; variantId: string | null; quantity: number };
export type ResolvedLine = { productRef: string; productId: string; variantId: string | null; title: string; sku: string | null; unitPriceMinor: bigint; quantity: number; vatRateBp: number; vatIncluded: boolean };

/**
 * Merges duplicate lines, resolves products by legacy ref and re-prices every line from VERIFIED database prices.
 * Shared by the cart preview and order placement so the customer sees exactly what the order will charge.
 */
export async function resolveCartLines(
  db: Db,
  items: CartItemInput[],
  now = new Date(),
  /** display/payment currency of the page language (TRY on Turkish pages, USD elsewhere) and the rates to reach it */
  target: { currency: string; rates: Pick<Rates, "USD" | "EUR"> | null; locale?: string } = { currency: "TRY", rates: null },
): Promise<{ ok: true; lines: ResolvedLine[]; converted: boolean } | { ok: false; code: "not_purchasable" | "variant"; productRef: string }> {
  let converted = false;
  // VAT applies to Turkish (TRY) sales only; foreign-language orders pay the listed price with no VAT line (client 11.11.2026)
  const noVat = target.currency !== "TRY";
  const titleLocale = target.locale && target.locale !== "tr" ? target.locale : "tr";
  const merged = new Map<string, CartItemInput>();
  for (const it of items) {
    const k = `${it.productRef}|${it.variantId ?? ""}`;
    merged.set(k, { ...it, quantity: Math.min(MAX_LINE_QTY, (merged.get(k)?.quantity ?? 0) + it.quantity) });
  }
  const products = await db.product.findMany({ where: { sourceKey: { in: [...merged.values()].map((l) => `kornne.com:${l.productRef}`) }, status: "PUBLISHED", needsReview: false, saleMode: { not: "QUOTE_ONLY" } }, select: { id: true, sourceKey: true, sku: true, translations: { where: { locale: { in: [...new Set(["tr", titleLocale])] as DbLocale[] } }, select: { title: true, locale: true } }, variants: { where: { active: true }, select: { id: true, labels: true } } } });
  const lines: ResolvedLine[] = [];
  for (const l of merged.values()) {
    const p = products.find((x) => x.sourceKey === `kornne.com:${l.productRef}`);
    if (!p) return { ok: false, code: "not_purchasable", productRef: l.productRef };
    const variant = l.variantId ? p.variants.find((v) => v.id === l.variantId) : null;
    if (l.variantId && !variant) return { ok: false, code: "not_purchasable", productRef: l.productRef };
    if (!l.variantId && p.variants.length) return { ok: false, code: "variant", productRef: l.productRef };
    const price = (l.variantId ? await purchasable(db, p.id, l.variantId, now) : null) ?? (await purchasable(db, p.id, null, now));
    if (!price) return { ok: false, code: "not_purchasable", productRef: l.productRef };
    // unit price in the order currency (same rounding as the storefront display, so cart = page price)
    const unit = convertMinor(price.amountMinor, price.currency, target.currency, target.rates);
    if (unit === null || unit <= 0n) return { ok: false, code: "not_purchasable", productRef: l.productRef };
    if (price.currency !== target.currency) converted = true;
    const labels = variant ? (variant.labels as Record<string, string>) : {};
    const vLabel = labels[titleLocale] || labels.tr || "";
    const title = (p.translations.find((t) => t.locale === titleLocale) ?? p.translations.find((t) => t.locale === "tr"))?.title ?? p.sourceKey;
    lines.push({ productRef: l.productRef, productId: p.id, variantId: variant?.id ?? null, title: `${title}${vLabel ? ` — ${vLabel}` : ""}`, sku: p.sku, unitPriceMinor: unit, quantity: l.quantity, vatRateBp: noVat ? 0 : price.vatRateBp!, vatIncluded: noVat ? true : price.vatIncluded! });
  }
  return { ok: true, lines, converted };
}

export async function placeBankTransferOrder(db: Db, gate: GateResult, raw: B2BCheckoutInput, ctx: { ipHash: string | null; now?: Date; isTest?: boolean; rates?: Pick<Rates, "USD" | "EUR"> | null }): Promise<PlaceOrderResult> {
  if (!gate.enabled) return { ok: false, code: "closed" };
  const now = ctx.now ?? new Date();
  const parsed = b2bCheckoutSchema.safeParse(raw);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const i of parsed.error.issues) {
      const k = String(i.path[0] ?? "form");
      fields[k] ??= /^(required|tooLong|invalidEmail|invalidPhone|invalidTaxNumber|acceptTerms|items)$/.test(i.message) ? i.message : "invalid";
    }
    return { ok: false, code: "validation", fields };
  }
  const input = parsed.data;
  const age = now.getTime() - input.startedAt;
  if (input.website || age < ORDER_LIMITS.minFillMs || age > ORDER_LIMITS.maxFormAgeMs) return { ok: false, code: "spam" };

  const existing = await db.order.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: { number: true, totalMinor: true, currency: true } });
  if (existing) return { ok: true, number: existing.number, accessToken: "", totalMinor: existing.totalMinor, currency: existing.currency, duplicate: true };
  if ((ctx.ipHash && (await limited(db, `order:ip:${ctx.ipHash}`, ORDER_LIMITS.perIpPerHour, 3_600_000))) || (await limited(db, `order:email:${sha(input.email)}`, ORDER_LIMITS.perEmailPerHour, 3_600_000))) return { ok: false, code: "rate" };

  // Turkish pages order and pay in TRY, every other language in USD (client decision 11.11.2026)
  const currency = displayCurrency(input.locale);
  if (currency !== "TRY") {
    const accounts = await db.bankAccount.findMany({ where: { active: true, currency }, select: { iban: true } });
    if (!accounts.some((a) => isValidTrIban(a.iban))) return { ok: false, code: "no_account" };
  }
  const rates = ctx.rates !== undefined ? ctx.rates : await getRates(db);
  const resolved = await resolveCartLines(db, input.items, now, { currency, rates, locale: input.locale });
  if (!resolved.ok) return resolved.code === "variant" ? { ok: false, code: "validation", fields: { items: "variantRequired" } } : { ok: false, code: "not_purchasable" };
  const fx = resolved.converted && rates ? { fxCurrency: currency === "TRY" ? "USD" : currency, fxRate4: currency === "EUR" ? rates.EUR : rates.USD } : { fxCurrency: null, fxRate4: null };
  const lines = resolved.lines;
  const totals = computeTotals(lines, shippingFor(currency));
  const accessToken = randomBytes(24).toString("base64url");
  const billing = { company: input.company, taxOffice: input.taxOffice, taxNumber: input.taxNumber, name: input.contactName, email: input.email, phone: input.phone, city: input.city, district: input.district, address: input.address, locale: input.locale };
  try {
    const order = await db.$transaction(async (tx) => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          return await tx.order.create({
            data: {
              number: `${ctx.isTest ? "TEST-" : ""}${newOrderNumber(now)}`,
              status: "AWAITING_PAYMENT",
              paymentStatus: "UNPAID",
              paymentMethod: "BANK_TRANSFER",
              channel: "WEB",
              currency,
              ...fx,
              subtotalMinor: totals.netMinor,
              taxMinor: totals.vatMinor,
              shippingMinor: totals.shippingMinor,
              totalMinor: totals.totalMinor,
              billing,
              shipping: input.shippingSame ? { sameAsBilling: true } : { address: input.shippingAddress },
              note: input.note,
              idempotencyKey: input.idempotencyKey,
              accessTokenHash: sha(accessToken),
              isTest: !!ctx.isTest,
              items: { create: lines.map((l) => ({ productId: l.productId, variantId: l.variantId, titleSnapshot: l.title, skuSnapshot: l.sku, unitPriceMinor: l.unitPriceMinor, quantity: l.quantity, lineTotalMinor: lineTotals(l).gross })) },
              statusEvents: { create: [{ toStatus: "DRAFT", actor: "customer" }, { fromStatus: "DRAFT", toStatus: "AWAITING_PAYMENT", actor: "customer", reason: "EFT/Havale" }] },
            },
          });
        } catch (e) {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && String((e.meta as { target?: unknown })?.target ?? "").includes("number")) continue;
          throw e;
        }
      }
      throw new Error("order number collision");
    });
    // transactional outbox: sales notification (reference + total only; customer data stays in the admin)
    await db.notificationOutbox.create({ data: { kind: "order.created", channel: "email", entityType: "Order", entityId: order.id, payload: { number: order.number, total: order.totalMinor.toString(), lines: lines.length }, status: "BLOCKED", lastError: "Bildirim sağlayıcısı ve alıcı adresi tanımlı değil" } }).catch(() => {});
    return { ok: true, number: order.number, accessToken, totalMinor: order.totalMinor, currency: order.currency, duplicate: false };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const again = await db.order.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: { number: true, totalMinor: true, currency: true } });
      if (again) return { ok: true, number: again.number, accessToken: "", totalMinor: again.totalMinor, currency: again.currency, duplicate: true };
    }
    return { ok: false, code: "error" };
  }
}

// ── public lookups (number + e-mail) ───────────────────────────────────────────────────────────────────────────────
const lookupSchema = z.object({ number: z.string().trim().toUpperCase().regex(/^(TEST-)?KRN-\d{6}-[A-Z0-9]{5}$/, "invalidNumber"), email: z.string().trim().toLowerCase().pipe(z.email("invalidEmail")) });

export type PublicOrderStatus = { number: string; placedAt: Date; status: string; paymentStatus: string; totalMinor: bigint; currency: string; itemCount: number; notified: boolean; lines: { title: string; quantity: number; lineTotalMinor: bigint }[] };

async function findByNumberAndEmail(db: Db, number: string, email: string) {
  const order = await db.order.findUnique({ where: { number }, include: { items: { select: { titleSnapshot: true, quantity: true, lineTotalMinor: true } }, paymentNotices: { select: { id: true } } } });
  const billingEmail = ((order?.billing ?? {}) as { email?: string }).email?.toLowerCase();
  return order && billingEmail === email ? order : null;
}

export async function lookupOrderStatus(db: Db, raw: { number: string; email: string }, ctx: { ipHash: string | null }): Promise<{ ok: true; order: PublicOrderStatus } | { ok: false; code: "validation" | "not_found" | "rate"; fields?: Record<string, string> }> {
  const p = lookupSchema.safeParse(raw);
  if (!p.success) return { ok: false, code: "validation", fields: Object.fromEntries(p.error.issues.map((i) => [String(i.path[0]), i.message])) };
  if (ctx.ipHash && (await limited(db, `order-lookup:ip:${ctx.ipHash}`, ORDER_LIMITS.lookupsPerIpPerHour, 3_600_000))) return { ok: false, code: "rate" };
  const o = await findByNumberAndEmail(db, p.data.number, p.data.email);
  if (!o) return { ok: false, code: "not_found" }; // same answer for "no such order" and "wrong e-mail"
  return { ok: true, order: { number: o.number, placedAt: o.placedAt, status: o.status, paymentStatus: o.paymentStatus, totalMinor: o.totalMinor, currency: o.currency, itemCount: o.items.length, notified: o.paymentNotices.length > 0, lines: o.items.map((i) => ({ title: i.titleSnapshot, quantity: i.quantity, lineTotalMinor: i.lineTotalMinor })) } };
}

/** Order page after checkout: guest access token (sent only to the browser that placed the order). */
export async function getOrderByToken(db: Db, number: string, token: string) {
  const o = await db.order.findUnique({ where: { number }, include: { items: true } });
  return o && o.accessTokenHash && token && sha(token) === o.accessTokenHash ? o : null;
}

const noticeSchema = z.object({
  number: lookupSchema.shape.number,
  email: lookupSchema.shape.email,
  payerName: text(2, 160),
  bankAccountId: z.string().min(1, "required"),
  amount: z.string().trim().transform((v) => v.replace(/\./g, "").replace(",", ".")).pipe(z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, "invalidAmount")),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalidDate"),
  note: optional(500),
  website: z.string().max(200).optional(),
});
export type PaymentNoticeInput = z.input<typeof noticeSchema>;

export async function submitPaymentNotice(db: Db, raw: PaymentNoticeInput, ctx: { ipHash: string | null; now?: Date }): Promise<{ ok: true } | { ok: false; code: "validation" | "not_found" | "rate" | "spam" | "state"; fields?: Record<string, string> }> {
  const p = noticeSchema.safeParse(raw);
  if (!p.success) return { ok: false, code: "validation", fields: Object.fromEntries(p.error.issues.map((i) => [String(i.path[0]), i.message])) };
  if (p.data.website) return { ok: false, code: "spam" };
  if (ctx.ipHash && (await limited(db, `notice:ip:${ctx.ipHash}`, ORDER_LIMITS.noticesPerIpPerHour, 3_600_000))) return { ok: false, code: "rate" };
  const o = await findByNumberAndEmail(db, p.data.number, p.data.email);
  if (!o) return { ok: false, code: "not_found" };
  if (o.status !== "AWAITING_PAYMENT") return { ok: false, code: "state" };
  const bank = await db.bankAccount.findFirst({ where: { id: p.data.bankAccountId, active: true, currency: o.currency }, select: { id: true } });
  if (!bank) return { ok: false, code: "validation", fields: { bankAccountId: "required" } };
  const paidAt = new Date(`${p.data.paidAt}T12:00:00Z`);
  const now = ctx.now ?? new Date();
  if (paidAt.getTime() > now.getTime() + 86_400_000 || paidAt.getTime() < now.getTime() - 60 * 86_400_000) return { ok: false, code: "validation", fields: { paidAt: "invalidDate" } };
  await db.$transaction([
    db.paymentNotice.create({ data: { orderId: o.id, bankAccountId: bank.id, payerName: p.data.payerName, amountMinor: BigInt(Math.round(Number(p.data.amount) * 100)), paidAt, note: p.data.note, ipHash: ctx.ipHash } }),
    db.order.updateMany({ where: { id: o.id, paymentStatus: "UNPAID" }, data: { paymentStatus: "NOTIFIED" } }),
  ]);
  return { ok: true };
}

// ── admin ───────────────────────────────────────────────────────────────────────────────────────────────────────────
export class OrderAdminError extends AdminError {}

async function move(db: Db, orderId: string, from: OrderState, to: OrderState, actor: Actor, reason: string) {
  assertTransition(from, to, actor);
  return db.$transaction(async (tx) => {
    const r = await tx.order.updateMany({ where: { id: orderId, status: from }, data: { status: to, ...(to === "PAID" ? { paymentStatus: "PAID" } : {}) } });
    if (r.count !== 1) throw new OrderAdminError("Sipariş durumu bu arada değişti; sayfayı yenileyin.");
    await tx.orderStatusEvent.create({ data: { orderId, fromStatus: from, toStatus: to, actor, reason } });
  });
}

/** Admin confirms the incoming EFT/Havale (bank statement checked). Matches the open notices of the order. */
export async function confirmBankTransfer(db: Db, actor: { id: string }, orderId: string, note: string) {
  const o = await db.order.findUnique({ where: { id: orderId }, select: { status: true, paymentMethod: true, totalMinor: true } });
  if (!o) throw new OrderAdminError("Sipariş bulunamadı.");
  if (o.paymentMethod !== "BANK_TRANSFER") throw new OrderAdminError("Yalnız EFT/Havale siparişleri elle onaylanır.");
  if (o.status !== "AWAITING_PAYMENT") throw new OrderAdminError("Sipariş ödeme beklemiyor.");
  if (clean(note).length < 3) throw new OrderAdminError("Kontrol notu gerekli (ör. dekont / hesap hareketi).");
  await move(db, orderId, "AWAITING_PAYMENT", "PAID", "admin", `EFT/Havale onayı: ${clean(note).slice(0, 200)}`);
  await db.paymentNotice.updateMany({ where: { orderId, status: "PENDING" }, data: { status: "MATCHED", reviewedById: actor.id, reviewedAt: new Date() } });
  await writeAuditLogVia(db, { actorId: actor.id, action: "order.payment_confirmed", entityType: "Order", entityId: orderId, after: { total: o.totalMinor.toString() } });
}

export async function advanceOrder(db: Db, actor: { id: string }, orderId: string, to: "PROCESSING" | "SHIPPED" | "DELIVERED" | "CANCELLED", reason: string) {
  const o = await db.order.findUnique({ where: { id: orderId }, select: { status: true } });
  if (!o) throw new OrderAdminError("Sipariş bulunamadı.");
  await move(db, orderId, o.status as OrderState, to, "admin", clean(reason).slice(0, 200) || to);
  if (to === "CANCELLED") await db.paymentNotice.updateMany({ where: { orderId, status: "PENDING" }, data: { status: "REJECTED", reviewedById: actor.id, reviewedAt: new Date() } });
  await writeAuditLogVia(db, { actorId: actor.id, action: `order.${to.toLowerCase()}`, entityType: "Order", entityId: orderId });
}
