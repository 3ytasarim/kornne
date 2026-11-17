"use server";

import { requireDb } from "@/lib/db";
import { commerceGate } from "@/lib/commerce/gate";
import { findByNumberAndEmail, limited, lookupOrderStatus, lookupSchema, placeBankTransferOrder, resolveCartLines, submitPaymentNotice, type B2BCheckoutInput, type CartItemInput, type PaymentNoticeInput } from "@/lib/commerce/b2b-orders";
import { shippingFor } from "@/lib/commerce/shipping";
import { computeTotals, lineTotals } from "@/lib/commerce/totals";
import { getClientIp, getIpHash } from "@/lib/request-meta";
import { startCardPayment } from "@/lib/commerce/card-payments";
import { iyzicoConfig } from "@/lib/commerce/payments/iyzico";
import { getSiteUrl } from "@/lib/seo/site";
import { displayCurrency } from "@/lib/fx/convert";
import { getRates } from "@/lib/fx/rates";
import { isEnabledLocale } from "@/lib/i18n/config";

/**
 * Storefront commerce actions (Sprint 12, EFT/Havale). Server Actions are POST-only with Next's Origin check
 * (CSRF-safe). Every amount is recomputed on the server; bigint values cross the boundary as decimal strings.
 */
const isTest = () => process.env.KORNNE_TEST_DB === "local-e2e" || process.env.NODE_ENV === "test";
const sanitizeItems = (items: unknown): CartItemInput[] =>
  (Array.isArray(items) ? items : []).slice(0, 50).flatMap((i) => {
    const it = i as Partial<CartItemInput>;
    return typeof it?.productRef === "string" && /^\d{1,8}$/.test(it.productRef) && Number.isInteger(it.quantity) && it.quantity! >= 1 && it.quantity! <= 999 ? [{ productRef: it.productRef, variantId: typeof it.variantId === "string" ? it.variantId : null, quantity: it.quantity! }] : [];
  });

export type PricedCart =
  | { ok: true; checkoutOpen: boolean; currency: string; lines: { productRef: string; variantId: string | null; unitMinor: string; lineMinor: string; quantity: number; vatRateBp: number }[]; netMinor: string; vatMinor: string; shippingMinor: string; totalMinor: string }
  | { ok: false; code: "not_purchasable" | "variant" | "empty" | "error"; productRef?: string };

export async function priceCartAction(items: CartItemInput[], locale: string): Promise<PricedCart> {
  const clean = sanitizeItems(items);
  if (!clean.length) return { ok: false, code: "empty" };
  try {
    // same currency rule as the storefront: TRY on Turkish pages, USD on every other language
    const loc = isEnabledLocale(locale) ? locale : "tr";
    const currency = displayCurrency(loc);
    const r = await resolveCartLines(requireDb(), clean, new Date(), { currency, rates: await getRates(requireDb()), locale: loc });
    if (!r.ok) return { ok: false, code: r.code, productRef: r.productRef };
    const t = computeTotals(r.lines, shippingFor(currency));
    return {
      ok: true,
      checkoutOpen: commerceGate().enabled,
      currency,
      lines: r.lines.map((l) => ({ productRef: l.productRef, variantId: l.variantId, unitMinor: l.unitPriceMinor.toString(), lineMinor: lineTotals(l).gross.toString(), quantity: l.quantity, vatRateBp: l.vatRateBp })),
      netMinor: t.netMinor.toString(),
      vatMinor: t.vatMinor.toString(),
      shippingMinor: t.shippingMinor.toString(),
      totalMinor: t.totalMinor.toString(),
    };
  } catch {
    return { ok: false, code: "error" };
  }
}

/** card orders: `redirectUrl` = iyzico payment page; `paymentStartFailed` = order saved but the payment page could not be opened */
export type PlaceOrderState = { ok: true; number: string; totalMinor: string; currency: string; paymentMethod: string; redirectUrl?: string; paymentStartFailed?: boolean } | { ok: false; code: string; fields?: Record<string, string> };

export async function placeOrderAction(input: B2BCheckoutInput): Promise<PlaceOrderState> {
  try {
    const cfg = iyzicoConfig();
    const db = requireDb();
    const r = await placeBankTransferOrder(db, commerceGate(), { ...input, items: sanitizeItems(input.items) }, { ipHash: await getIpHash(), isTest: isTest(), cardEnabled: !!cfg });
    if (r.ok && r.paymentMethod === "CARD" && cfg) {
      const start = await startCardPayment(db, cfg, r.orderId, { siteUrl: getSiteUrl(), ip: await getClientIp() });
      return { ok: true, number: r.number, totalMinor: r.totalMinor.toString(), currency: r.currency, paymentMethod: r.paymentMethod, ...(start.ok ? { redirectUrl: start.url } : { paymentStartFailed: true }) };
    }
    if (r.ok) return { ok: true, number: r.number, totalMinor: r.totalMinor.toString(), currency: r.currency, paymentMethod: r.paymentMethod };
    return { ok: false, code: r.code, fields: "fields" in r ? r.fields : undefined };
  } catch {
    return { ok: false, code: "error" };
  }
}

export type OrderStatusState =
  | { ok: true; order: { number: string; placedAt: string; status: string; paymentStatus: string; totalMinor: string; currency: string; notified: boolean; lines: { title: string; quantity: number; lineTotalMinor: string }[] } }
  | { ok: false; code: string; fields?: Record<string, string> };

export async function lookupOrderAction(input: { number: string; email: string }): Promise<OrderStatusState> {
  try {
    const r = await lookupOrderStatus(requireDb(), { number: String(input.number ?? ""), email: String(input.email ?? "") }, { ipHash: await getIpHash() });
    if (!r.ok) return { ok: false, code: r.code, fields: r.fields };
    const o = r.order;
    return { ok: true, order: { number: o.number, placedAt: o.placedAt.toISOString(), status: o.status, paymentStatus: o.paymentStatus, totalMinor: o.totalMinor.toString(), currency: o.currency, notified: o.notified, lines: o.lines.map((l) => ({ title: l.title, quantity: l.quantity, lineTotalMinor: l.lineTotalMinor.toString() })) } };
  } catch {
    return { ok: false, code: "error" };
  }
}

export async function paymentNoticeAction(input: PaymentNoticeInput): Promise<{ ok: true } | { ok: false; code: string; fields?: Record<string, string> }> {
  try {
    return await submitPaymentNotice(requireDb(), input, { ipHash: await getIpHash() });
  } catch {
    return { ok: false, code: "error" };
  }
}

/** Another card attempt for an open card order (order number + the e-mail used at checkout, rate-limited). */
export async function retryCardPaymentAction(input: { number: string; email: string }): Promise<{ ok: true; redirectUrl: string } | { ok: false; code: "validation" | "not_found" | "rate" | "state" | "limit" | "provider" | "closed" | "error" }> {
  try {
    const cfg = iyzicoConfig();
    if (!cfg) return { ok: false, code: "closed" };
    const p = lookupSchema.safeParse({ number: String(input.number ?? ""), email: String(input.email ?? "") });
    if (!p.success) return { ok: false, code: "validation" };
    const db = requireDb();
    const ipHash = await getIpHash();
    if (await limited(db, `card-retry:ip:${ipHash}`, 10, 3_600_000)) return { ok: false, code: "rate" };
    const order = await findByNumberAndEmail(db, p.data.number, p.data.email);
    if (!order) return { ok: false, code: "not_found" };
    const r = await startCardPayment(db, cfg, order.id, { siteUrl: getSiteUrl(), ip: await getClientIp() });
    return r.ok ? { ok: true, redirectUrl: r.url } : { ok: false, code: r.code === "not_found" ? "not_found" : r.code };
  } catch {
    return { ok: false, code: "error" };
  }
}
