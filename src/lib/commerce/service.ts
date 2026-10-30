import { createHash, randomBytes } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { GateResult } from "./gate";
import { assertTransition, type Actor, type OrderState } from "./order-state";
import type { PaymentProvider } from "./payments/provider";
import { computeTotals, lineTotals, MAX_LINE_QTY, type TotalsLine } from "./totals";

/**
 * Priced-commerce services (Sprint 5 — LOCKED). Every function re-checks the gate and the product's VERIFIED price
 * on the server; prices/amounts NEVER come from the client. Exercised only in the isolated "kornne_test" schema.
 */
type Db = PrismaClient;
export class CommerceError extends Error {
  constructor(public code: "checkout_disabled" | "not_purchasable" | "invalid_quantity" | "not_found" | "forbidden" | "empty" | "invalid_state") {
    super(code);
  }
}
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const requireGate = (gate: GateResult) => {
  if (!gate.enabled) throw new CommerceError("checkout_disabled");
};

/** The currently valid VERIFIED price with a known VAT treatment, or null (= quote only). */
async function purchasablePrice(db: Db | Prisma.TransactionClient, productId: string, variantId: string | null) {
  const product = await db.product.findFirst({ where: { id: productId, status: "PUBLISHED", needsReview: false }, select: { id: true, saleMode: true } });
  if (!product || product.saleMode === "QUOTE_ONLY") return null;
  const now = new Date();
  const price = await db.price.findFirst({
    where: { productId, variantId: variantId ?? null, status: "VERIFIED", vatIncluded: { not: null }, vatRateBp: { not: null }, validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gt: now } }] },
    orderBy: { validFrom: "desc" },
  });
  return price;
}

// ── cart ──────────────────────────────────────────────────────────────────────────────────────────────────────────
export async function getOrCreateCart(db: Db, token: string, opts: { isTest?: boolean } = {}) {
  const tokenHash = sha(token);
  return (await db.cart.findUnique({ where: { tokenHash } })) ?? db.cart.create({ data: { tokenHash, isTest: !!opts.isTest, expiresAt: new Date(Date.now() + 30 * 86_400_000) } });
}

export async function addToCart(db: Db, gate: GateResult, cartToken: string, productId: string, variantId: string | null, quantity: number, opts: { isTest?: boolean } = {}) {
  requireGate(gate);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_LINE_QTY) throw new CommerceError("invalid_quantity");
  if (!(await purchasablePrice(db, productId, variantId))) throw new CommerceError("not_purchasable");
  const cart = await getOrCreateCart(db, cartToken, opts);
  const variantKey = variantId ?? "";
  const existing = await db.cartItem.findUnique({ where: { cartId_productId_variantKey: { cartId: cart.id, productId, variantKey } } });
  const next = Math.min(MAX_LINE_QTY, (existing?.quantity ?? 0) + quantity);
  return db.cartItem.upsert({ where: { cartId_productId_variantKey: { cartId: cart.id, productId, variantKey } }, create: { cartId: cart.id, productId, variantKey, quantity: next }, update: { quantity: next } });
}

// ── order ─────────────────────────────────────────────────────────────────────────────────────────────────────────
async function transition(tx: Prisma.TransactionClient, orderId: string, from: OrderState, to: OrderState, actor: Actor, reason?: string) {
  assertTransition(from, to, actor);
  // conditional update = optimistic lock: only one concurrent caller can move the order out of `from`
  const res = await tx.order.updateMany({ where: { id: orderId, status: from }, data: { status: to, ...(to === "PAID" ? { paymentStatus: "PAID" } : to === "FAILED" ? { paymentStatus: "FAILED" } : {}) } });
  if (res.count !== 1) return false;
  await tx.orderStatusEvent.create({ data: { orderId, fromStatus: from, toStatus: to, actor, reason } });
  return true;
}

export type DraftInput = { contact: { name: string; email: string; phone?: string }; shippingAddress: Record<string, string>; customerId?: string | null };

/** Cart → DRAFT order. Totals are recomputed from VERIFIED DB prices; returns the guest access token once. */
export async function createDraftOrder(db: Db, gate: GateResult, cartToken: string, input: DraftInput, opts: { isTest?: boolean; shippingMinor?: bigint } = {}) {
  requireGate(gate);
  const cart = await db.cart.findUnique({ where: { tokenHash: sha(cartToken) }, include: { items: true } });
  if (!cart || cart.status !== "ACTIVE" || !cart.items.length) throw new CommerceError("empty");
  const lines: (TotalsLine & { productId: string; variantId: string | null; title: string; sku: string | null })[] = [];
  for (const it of cart.items) {
    const variantId = it.variantKey || null;
    const price = await purchasablePrice(db, it.productId, variantId);
    if (!price) throw new CommerceError("not_purchasable");
    const t = await db.productTranslation.findFirst({ where: { productId: it.productId, locale: "tr" }, select: { title: true } });
    const p = await db.product.findUniqueOrThrow({ where: { id: it.productId }, select: { sku: true } });
    lines.push({ productId: it.productId, variantId, title: t?.title ?? it.productId, sku: p.sku, unitPriceMinor: price.amountMinor, quantity: it.quantity, vatRateBp: price.vatRateBp!, vatIncluded: price.vatIncluded! });
  }
  const totals = computeTotals(lines, opts.shippingMinor ?? 0n);
  const accessToken = randomBytes(24).toString("base64url");
  const order = await db.$transaction(async (tx) => {
    const o = await tx.order.create({
      data: {
        number: `${opts.isTest ? "TEST-" : ""}${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`,
        status: "DRAFT",
        customerId: input.customerId ?? null,
        currency: "TRY",
        subtotalMinor: totals.netMinor,
        taxMinor: totals.vatMinor,
        shippingMinor: totals.shippingMinor,
        totalMinor: totals.totalMinor,
        billing: { name: input.contact.name, email: input.contact.email, phone: input.contact.phone ?? null },
        shipping: input.shippingAddress,
        accessTokenHash: sha(accessToken),
        isTest: !!opts.isTest,
        items: { create: lines.map((l) => ({ productId: l.productId, variantId: l.variantId, titleSnapshot: l.title, skuSnapshot: l.sku, unitPriceMinor: l.unitPriceMinor, quantity: l.quantity, lineTotalMinor: lineTotals(l).gross })) },
        statusEvents: { create: { toStatus: "DRAFT", actor: "customer" } },
      },
    });
    await tx.cart.update({ where: { id: cart.id }, data: { status: "CONVERTED" } });
    return o;
  });
  return { order, accessToken, totals };
}

/** DRAFT/FAILED → AWAITING_PAYMENT + a PaymentAttempt at the provider (idempotent per key). */
export async function startPayment(db: Db, gate: GateResult, provider: PaymentProvider, orderId: string, idempotencyKey: string) {
  requireGate(gate);
  const existing = await db.paymentAttempt.findUnique({ where: { idempotencyKey } });
  if (existing) return existing;
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) throw new CommerceError("not_found");
  const from = order.status as OrderState;
  if (from !== "DRAFT" && from !== "FAILED") throw new CommerceError("invalid_state");
  return db.$transaction(async (tx) => {
    if (!(await transition(tx, orderId, from, "AWAITING_PAYMENT", "customer"))) throw new CommerceError("invalid_state");
    const attempt = await tx.paymentAttempt.create({ data: { orderId, provider: provider.name, providerRef: `pending_${randomBytes(8).toString("hex")}`, amountMinor: order.totalMinor, currency: order.currency, idempotencyKey } });
    const created = await provider.createPayment({ attemptId: attempt.id, amountMinor: order.totalMinor, currency: order.currency, returnUrl: "/odeme/sonuc" });
    return tx.paymentAttempt.update({ where: { id: attempt.id }, data: { providerRef: created.providerRef } });
  });
}

export type WebhookOutcome = "paid" | "failed" | "duplicate" | "rejected_signature" | "amount_mismatch" | "unknown_payment" | "ignored_state";

/**
 * Provider callback. Order of checks: signature → replay (provider,eventId unique) → known attempt → amount &
 * currency equal to the attempt → state transition guarded by an optimistic conditional update.
 * Every callback, even an invalid one, is recorded.
 */
export async function processWebhook(db: Db, gate: GateResult, provider: PaymentProvider, rawBody: string, headers: Headers, now = new Date()): Promise<{ httpStatus: number; outcome: WebhookOutcome }> {
  requireGate(gate);
  const verified = provider.verifyWebhook(rawBody, headers, now);
  if (!verified.valid) {
    await db.paymentWebhookEvent.create({ data: { provider: provider.name, eventId: `invalid_${sha(rawBody + now.getTime()).slice(0, 24)}`, signatureValid: false, payload: { reason: verified.reason }, outcome: "rejected_signature" } });
    return { httpStatus: 401, outcome: "rejected_signature" };
  }
  const ev = verified.event;
  try {
    await db.paymentWebhookEvent.create({ data: { provider: provider.name, eventId: ev.eventId, signatureValid: true, payload: { ref: ev.providerRef, status: ev.status, amount: ev.amountMinor.toString(), currency: ev.currency }, outcome: "received" } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { httpStatus: 200, outcome: "duplicate" };
    throw e;
  }
  const finish = async (outcome: WebhookOutcome, httpStatus = 200) => {
    await db.paymentWebhookEvent.update({ where: { provider_eventId: { provider: provider.name, eventId: ev.eventId } }, data: { outcome, processedAt: new Date() } });
    return { httpStatus, outcome };
  };
  const attempt = await db.paymentAttempt.findUnique({ where: { providerRef: ev.providerRef } });
  if (!attempt || attempt.provider !== provider.name) return finish("unknown_payment", 404);
  if (attempt.amountMinor !== ev.amountMinor || attempt.currency !== ev.currency) {
    await db.$transaction(async (tx) => {
      await tx.paymentAttempt.update({ where: { id: attempt.id }, data: { status: "FAILED", failureReason: "amount_or_currency_mismatch" } });
      await transition(tx, attempt.orderId, "AWAITING_PAYMENT", "FAILED", "provider", "amount_or_currency_mismatch");
    });
    return finish("amount_mismatch", 400);
  }
  const to: OrderState = ev.status === "succeeded" ? "PAID" : "FAILED";
  const moved = await db.$transaction(async (tx) => {
    const ok = await transition(tx, attempt.orderId, "AWAITING_PAYMENT", to, "provider", `event ${ev.eventId}`);
    if (ok) await tx.paymentAttempt.update({ where: { id: attempt.id }, data: { status: to === "PAID" ? "SUCCEEDED" : "FAILED", failureReason: to === "FAILED" ? "provider_reported_failure" : null } });
    return ok;
  });
  return finish(moved ? (to === "PAID" ? "paid" : "failed") : "ignored_state");
}

/** IDOR-safe order lookup: the owner customer, or a guest holding the access token — nobody else. */
export async function getOrderForViewer(db: Db, orderId: string, viewer: { customerId?: string | null; accessToken?: string | null }) {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) return null;
  const ownerOk = !!viewer.customerId && order.customerId === viewer.customerId;
  const tokenOk = !!viewer.accessToken && !!order.accessTokenHash && sha(viewer.accessToken) === order.accessTokenHash;
  return ownerOk || tokenOk ? order : null;
}
