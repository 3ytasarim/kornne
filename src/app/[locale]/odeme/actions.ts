"use server";

import { requireDb } from "@/lib/db";
import { commerceGate } from "@/lib/commerce/gate";
import { lookupOrderStatus, placeBankTransferOrder, resolveCartLines, submitPaymentNotice, type B2BCheckoutInput, type CartItemInput, type PaymentNoticeInput } from "@/lib/commerce/b2b-orders";
import { computeTotals, lineTotals } from "@/lib/commerce/totals";
import { getIpHash } from "@/lib/request-meta";
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
  | { ok: true; checkoutOpen: boolean; currency: string; lines: { productRef: string; variantId: string | null; unitMinor: string; lineMinor: string; quantity: number; vatRateBp: number }[]; netMinor: string; vatMinor: string; totalMinor: string }
  | { ok: false; code: "not_purchasable" | "variant" | "empty" | "error"; productRef?: string };

export async function priceCartAction(items: CartItemInput[], locale: string): Promise<PricedCart> {
  const clean = sanitizeItems(items);
  if (!clean.length) return { ok: false, code: "empty" };
  try {
    // same currency rule as the storefront: TRY on Turkish pages, USD on every other language
    const currency = displayCurrency(isEnabledLocale(locale) ? locale : "tr");
    const r = await resolveCartLines(requireDb(), clean, new Date(), { currency, rates: await getRates(requireDb()) });
    if (!r.ok) return { ok: false, code: r.code, productRef: r.productRef };
    const t = computeTotals(r.lines);
    return {
      ok: true,
      checkoutOpen: commerceGate().enabled,
      currency,
      lines: r.lines.map((l) => ({ productRef: l.productRef, variantId: l.variantId, unitMinor: l.unitPriceMinor.toString(), lineMinor: lineTotals(l).gross.toString(), quantity: l.quantity, vatRateBp: l.vatRateBp })),
      netMinor: t.netMinor.toString(),
      vatMinor: t.vatMinor.toString(),
      totalMinor: t.totalMinor.toString(),
    };
  } catch {
    return { ok: false, code: "error" };
  }
}

export type PlaceOrderState = { ok: true; number: string; totalMinor: string; currency: string } | { ok: false; code: string; fields?: Record<string, string> };

export async function placeOrderAction(input: B2BCheckoutInput): Promise<PlaceOrderState> {
  try {
    const r = await placeBankTransferOrder(requireDb(), commerceGate(), { ...input, items: sanitizeItems(input.items) }, { ipHash: await getIpHash(), isTest: isTest() });
    if (r.ok) return { ok: true, number: r.number, totalMinor: r.totalMinor.toString(), currency: r.currency };
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
