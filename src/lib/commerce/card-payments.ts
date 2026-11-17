import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { assertTransition } from "./order-state";
import { initializeCheckoutForm, initSignatureValid, priceToMinor, retrieveCheckoutForm, retrieveSignatureValid, safePaymentPageUrl, toPrice, type InitRequest, type IyzicoConfig, type RetrieveResult } from "./payments/iyzico";

/**
 * Card payments through the iyzico Checkout Form (hosted page). An order is marked PAID ONLY after the result has
 * been fetched from iyzico server-side (never trusted from the browser), its signature verified and amount, currency,
 * basket (order number) and attempt (conversationId) matched. Every result is recorded (PaymentWebhookEvent).
 *  - fraudStatus 1 → PAID · 0 → stays "awaiting payment" (iyzico review; the webhook / a later check settles it)
 *  - failed / rejected → the attempt fails, the order stays open so the customer can try again or pay by transfer
 *  - amount / currency / basket mismatch → order FAILED, never shipped (manual check + refund at iyzico)
 */
type Db = PrismaClient;
type Fetch = typeof fetch;
const PROVIDER = "iyzico";
export const MAX_CARD_ATTEMPTS = 5;

type Billing = { company?: string; taxNumber?: string; name?: string; email?: string; phone?: string; city?: string; district?: string; address?: string; locale?: string };

const splitName = (full: string) => {
  const parts = full.trim().split(/\s+/);
  return parts.length > 1 ? { name: parts.slice(0, -1).join(" "), surname: parts.at(-1)! } : { name: parts[0] || "-", surname: parts[0] || "-" };
};
const cut = (s: string | undefined, n: number, fallback = "-") => (s ?? "").replace(/\s+/g, " ").trim().slice(0, n) || fallback;

/** Builds the Checkout Form request; the basket must add up exactly to the order total (else refused). */
export function buildInitRequest(
  order: { id: string; number: string; currency: string; totalMinor: bigint; shippingMinor: bigint; billing: unknown; shipping: unknown; items: { id: string; titleSnapshot: string; lineTotalMinor: bigint }[] },
  ctx: { attemptId: string; callbackUrl: string; ip?: string | null },
): InitRequest {
  const b = (order.billing ?? {}) as Billing;
  const turkish = order.currency === "TRY";
  // Turkish orders: province (city) + district; other languages: city + country (stored in "district")
  const city = cut(b.city, 60);
  const country = turkish ? "Turkey" : cut(b.district, 60);
  const address = cut(b.address, 400);
  const shippingAddress = cut(((order.shipping ?? {}) as { address?: string }).address, 400, address);
  const contactName = cut(b.name, 120);
  const digits = (b.taxNumber ?? "").replace(/\D/g, "");
  const items = order.items.map((i) => ({ id: i.id, name: cut(i.titleSnapshot, 200), category1: "Endüstriyel ekipman", itemType: "PHYSICAL" as const, price: toPrice(i.lineTotalMinor) }));
  if (order.shippingMinor > 0n) items.push({ id: "shipping", name: "Shipping", category1: "Shipping", itemType: "PHYSICAL", price: toPrice(order.shippingMinor) });
  const sum = order.items.reduce((s, i) => s + i.lineTotalMinor, 0n) + order.shippingMinor;
  if (sum !== order.totalMinor || items.some((i) => i.price === "0.00")) throw new Error(`basket ${sum} ≠ total ${order.totalMinor}`);
  return {
    locale: turkish ? "tr" : "en",
    conversationId: ctx.attemptId,
    price: toPrice(order.totalMinor),
    paidPrice: toPrice(order.totalMinor),
    currency: order.currency,
    basketId: order.number,
    paymentGroup: "PRODUCT",
    callbackUrl: ctx.callbackUrl,
    enabledInstallments: [1],
    buyer: {
      id: order.id,
      ...splitName(contactName),
      gsmNumber: cut((b.phone ?? "").replace(/[^\d+]/g, ""), 20),
      email: cut(b.email, 160),
      // VKN (10) / TCKN (11) on Turkish orders; foreign buyers have none → iyzico's documented placeholder
      identityNumber: digits.length === 10 || digits.length === 11 ? digits : "11111111111",
      registrationAddress: address,
      ...(ctx.ip ? { ip: ctx.ip } : {}),
      city,
      country,
    },
    shippingAddress: { contactName, city, country, address: shippingAddress },
    billingAddress: { contactName: cut(b.company, 120, contactName), city, country, address },
    basketItems: items,
  };
}

export type StartResult = { ok: true; url: string } | { ok: false; code: "not_found" | "state" | "limit" | "provider" };

/** Opens a new payment attempt for an order awaiting card payment and returns iyzico's payment page URL. */
export async function startCardPayment(db: Db, cfg: IyzicoConfig, orderId: string, ctx: { siteUrl: string; ip?: string | null }, fetchImpl: Fetch = fetch): Promise<StartResult> {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { items: { select: { id: true, titleSnapshot: true, lineTotalMinor: true } }, payments: { select: { status: true } } } });
  if (!order) return { ok: false, code: "not_found" };
  if (order.paymentMethod !== "CARD" || order.status !== "AWAITING_PAYMENT" || order.payments.some((p) => p.status === "SUCCEEDED")) return { ok: false, code: "state" };
  if (order.payments.length >= MAX_CARD_ATTEMPTS) return { ok: false, code: "limit" };
  const attempt = await db.paymentAttempt.create({ data: { orderId: order.id, provider: PROVIDER, providerRef: `pending_${randomUUID()}`, amountMinor: order.totalMinor, currency: order.currency, idempotencyKey: `${PROVIDER}:${order.id}:${randomUUID()}` } });
  const fail = async (reason: string) => {
    await db.paymentAttempt.update({ where: { id: attempt.id }, data: { status: "FAILED", failureReason: reason.slice(0, 300) } });
    return { ok: false as const, code: "provider" as const };
  };
  let req: InitRequest;
  try {
    req = buildInitRequest(order, { attemptId: attempt.id, callbackUrl: `${ctx.siteUrl.replace(/\/+$/, "")}/api/v1/payments/iyzico/callback`, ip: ctx.ip });
  } catch (e) {
    return fail(`basket: ${e instanceof Error ? e.message : "invalid"}`);
  }
  try {
    const res = await initializeCheckoutForm(cfg, req, fetchImpl);
    const url = safePaymentPageUrl(res.paymentPageUrl);
    if (res.status !== "success" || !res.token || !url) return fail(`init: ${res.errorCode ?? ""} ${res.errorMessage ?? "no token"}`);
    if (res.signature && !initSignatureValid(cfg.secretKey, res)) return fail("init: bad signature");
    await db.paymentAttempt.update({ where: { id: attempt.id }, data: { providerRef: res.token } });
    return { ok: true, url };
  } catch (e) {
    return fail(`init: ${e instanceof Error ? e.message : "network"}`);
  }
}

export type FinalizeOutcome = "paid" | "review" | "failed" | "mismatch" | "invalid" | "unknown";
export type FinalizeResult = { outcome: FinalizeOutcome; orderNumber?: string; locale?: string };

async function record(db: Db, eventId: string, signatureValid: boolean, payload: object, outcome: string) {
  try {
    await db.paymentWebhookEvent.create({ data: { provider: PROVIDER, eventId: `${eventId}:${outcome}`.slice(0, 190), signatureValid, payload: payload as Prisma.InputJsonValue, outcome, processedAt: new Date() } });
  } catch (e) {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e; // same result seen before
  }
}

/**
 * Settles a payment from its Checkout Form token (callback or webhook). Idempotent: a second call for a settled
 * attempt changes nothing.
 */
export async function finalizeCardPayment(db: Db, cfg: IyzicoConfig, token: string, fetchImpl: Fetch = fetch): Promise<FinalizeResult> {
  if (!/^[A-Za-z0-9-]{8,128}$/.test(token)) return { outcome: "unknown" };
  const attempt = await db.paymentAttempt.findUnique({ where: { providerRef: token }, include: { order: { select: { id: true, number: true, status: true, currency: true, totalMinor: true, billing: true } } } });
  if (!attempt || attempt.provider !== PROVIDER) return { outcome: "unknown" };
  const order = attempt.order;
  const base = { orderNumber: order.number, locale: ((order.billing ?? {}) as Billing).locale };
  if (attempt.status === "SUCCEEDED") return { ...base, outcome: "paid" };

  let r: RetrieveResult;
  try {
    r = await retrieveCheckoutForm(cfg, token, attempt.id, fetchImpl);
  } catch {
    return { ...base, outcome: "review" }; // iyzico unreachable: nothing changes, the webhook / a retry settles it
  }
  const sigOk = retrieveSignatureValid(cfg.secretKey, r);
  const summary = { order: order.number, attempt: attempt.id, status: r.status, paymentStatus: r.paymentStatus, fraudStatus: r.fraudStatus, paymentId: r.paymentId, price: r.price, paidPrice: r.paidPrice, currency: r.currency, card: r.cardAssociation, last4: r.lastFourDigits, errorCode: r.errorCode, errorMessage: r.errorMessage, transactions: (r.itemTransactions ?? []).map((t) => ({ itemId: t.itemId, paymentTransactionId: t.paymentTransactionId, paidPrice: t.paidPrice, status: t.transactionStatus })) };
  const eventId = `cf:${token}:${r.paymentStatus ?? r.status}:${r.fraudStatus ?? ""}`;

  if (r.status !== "success" || r.paymentStatus !== "SUCCESS") {
    // nothing was collected (declined, abandoned, 3-D Secure failed …) — the order stays open for another try
    await db.paymentAttempt.updateMany({ where: { id: attempt.id, status: "PENDING" }, data: { status: "FAILED", failureReason: `${r.errorCode ?? r.paymentStatus ?? r.status ?? "failure"}: ${r.errorMessage ?? ""}`.slice(0, 300) } });
    await record(db, eventId, sigOk, summary, "failed");
    return { ...base, outcome: "failed" };
  }
  if (!sigOk) {
    await record(db, eventId, false, summary, "rejected_signature");
    return { ...base, outcome: "invalid" };
  }
  const paid = priceToMinor(r.paidPrice);
  const price = priceToMinor(r.price);
  if (r.conversationId !== attempt.id || r.basketId !== order.number || r.currency !== attempt.currency || paid !== attempt.amountMinor || price !== attempt.amountMinor || attempt.amountMinor !== order.totalMinor || attempt.currency !== order.currency) {
    await db.$transaction(async (tx) => {
      await tx.paymentAttempt.update({ where: { id: attempt.id }, data: { status: "FAILED", failureReason: "amount_currency_or_basket_mismatch" } });
      assertTransition("AWAITING_PAYMENT", "FAILED", "provider");
      const moved = await tx.order.updateMany({ where: { id: order.id, status: "AWAITING_PAYMENT" }, data: { status: "FAILED", paymentStatus: "FAILED" } });
      if (moved.count) await tx.orderStatusEvent.create({ data: { orderId: order.id, fromStatus: "AWAITING_PAYMENT", toStatus: "FAILED", actor: "provider", reason: `iyzico tutar/para birimi uyuşmazlığı (paymentId ${r.paymentId}) — iyzico panelinden kontrol + iade` } });
    });
    await record(db, eventId, true, summary, "amount_mismatch");
    return { ...base, outcome: "mismatch" };
  }
  if (r.fraudStatus === 0) {
    await db.paymentAttempt.updateMany({ where: { id: attempt.id, status: "PENDING" }, data: { failureReason: `fraud_review (paymentId ${r.paymentId})` } });
    await record(db, eventId, true, summary, "fraud_review");
    return { ...base, outcome: "review" };
  }
  if (r.fraudStatus !== 1) {
    await db.paymentAttempt.updateMany({ where: { id: attempt.id, status: "PENDING" }, data: { status: "FAILED", failureReason: `fraud_rejected (paymentId ${r.paymentId})` } });
    await record(db, eventId, true, summary, "fraud_rejected");
    return { ...base, outcome: "failed" };
  }
  const card = [r.cardAssociation, r.lastFourDigits ? `****${r.lastFourDigits}` : null].filter(Boolean).join(" ");
  const moved = await db.$transaction(async (tx) => {
    const a = await tx.paymentAttempt.updateMany({ where: { id: attempt.id, status: "PENDING" }, data: { status: "SUCCEEDED", failureReason: null } });
    if (!a.count) return false;
    assertTransition("AWAITING_PAYMENT", "PAID", "provider");
    const o = await tx.order.updateMany({ where: { id: order.id, status: "AWAITING_PAYMENT" }, data: { status: "PAID", paymentStatus: "PAID" } });
    if (!o.count) throw new Error("order not awaiting payment"); // rolls back; recorded below for a manual check
    await tx.orderStatusEvent.create({ data: { orderId: order.id, fromStatus: "AWAITING_PAYMENT", toStatus: "PAID", actor: "provider", reason: `iyzico ödeme ${r.paymentId}${card ? ` · ${card}` : ""}` } });
    return true;
  }).catch(() => null);
  if (moved === null) {
    await record(db, eventId, true, summary, "paid_but_order_not_open");
    return { ...base, outcome: "mismatch" };
  }
  await record(db, eventId, true, summary, moved ? "paid" : "duplicate");
  return { ...base, outcome: "paid" };
}
