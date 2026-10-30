import { describe, expect, it } from "vitest";
import { commerceGate, GATE_BLOCKERS, TEST_COMMERCE_ENV } from "@/lib/commerce/gate";
import { assertTransition, canTransition } from "@/lib/commerce/order-state";
import { MockProvider } from "@/lib/commerce/payments/provider";
import { computeTotals, divRoundHalfUp, lineTotals } from "@/lib/commerce/totals";

describe("commerce gate — the flag alone never opens checkout", () => {
  it("is closed by default (no env)", () => {
    const g = commerceGate({});
    expect(g.enabled).toBe(false);
    expect(g.blockers).toContain(GATE_BLOCKERS.flag);
  });
  it("stays closed with ENABLE_PAID_CHECKOUT=true but no seller/VAT/shipping/legal/provider", () => {
    const g = commerceGate({ ENABLE_PAID_CHECKOUT: "true" });
    expect(g.enabled).toBe(false);
    expect(g.blockers).toEqual(expect.arrayContaining([GATE_BLOCKERS.seller, GATE_BLOCKERS.vat, GATE_BLOCKERS.shipping, GATE_BLOCKERS.legal, GATE_BLOCKERS.provider]));
  });
  it("refuses the mock provider outside tests", () => {
    expect(commerceGate({ ...TEST_COMMERCE_ENV, NODE_ENV: "production" }).blockers).toContain(GATE_BLOCKERS.mockInProd);
    expect(commerceGate(TEST_COMMERCE_ENV).enabled).toBe(true);
  });
  it("is closed in this process (real env)", () => {
    expect(commerceGate().enabled).toBe(false);
  });
});

describe("totals — exact integer kuruş", () => {
  it("rounds half-up", () => {
    expect(divRoundHalfUp(5n, 2n)).toBe(3n);
    expect(divRoundHalfUp(4n, 3n)).toBe(1n);
  });
  it("VAT included: 1.200,00 TL @20% → net 1.000,00 + VAT 200,00", () => {
    expect(lineTotals({ unitPriceMinor: 120000n, quantity: 1, vatRateBp: 2000, vatIncluded: true })).toEqual({ net: 100000n, vat: 20000n, gross: 120000n });
  });
  it("VAT excluded: 0,05 TL x 3 @20% → VAT 0,03 (half-up of 0,03)", () => {
    expect(lineTotals({ unitPriceMinor: 5n, quantity: 3, vatRateBp: 2000, vatIncluded: false })).toEqual({ net: 15n, vat: 3n, gross: 18n });
  });
  it("sums lines + shipping without floating point drift", () => {
    const t = computeTotals(
      [
        { unitPriceMinor: 180747994n, quantity: 2, vatRateBp: 2000, vatIncluded: true },
        { unitPriceMinor: 77101n, quantity: 7, vatRateBp: 2000, vatIncluded: true },
      ],
      150000n,
    );
    expect(t.grossMinor).toBe(180747994n * 2n + 77101n * 7n);
    expect(t.totalMinor).toBe(t.grossMinor + 150000n);
    expect(t.netMinor + t.vatMinor).toBe(t.grossMinor);
  });
  it("rejects invalid quantities and prices", () => {
    for (const quantity of [0, -1, 1000, 1.5, Number.NaN]) expect(() => lineTotals({ unitPriceMinor: 100n, quantity, vatRateBp: 2000, vatIncluded: true })).toThrow();
    expect(() => lineTotals({ unitPriceMinor: 0n, quantity: 1, vatRateBp: 2000, vatIncluded: true })).toThrow();
    expect(() => computeTotals([])).toThrow();
  });
});

describe("order state machine", () => {
  it("only a verified provider callback or an admin (EFT/Havale confirmation, Sprint 12) can mark an order paid", () => {
    expect(canTransition("AWAITING_PAYMENT", "PAID", "provider")).toBe(true);
    expect(canTransition("AWAITING_PAYMENT", "PAID", "admin")).toBe(true);
    for (const a of ["customer", "system"] as const) expect(canTransition("AWAITING_PAYMENT", "PAID", a)).toBe(false);
  });
  it("rejects skipping states", () => {
    expect(() => assertTransition("DRAFT", "PAID", "provider")).toThrow();
    expect(() => assertTransition("CANCELLED", "AWAITING_PAYMENT", "customer")).toThrow();
    expect(() => assertTransition("PAID", "DRAFT", "admin")).toThrow();
  });
  it("allows retry after failure by the customer only", () => {
    expect(canTransition("FAILED", "AWAITING_PAYMENT", "customer")).toBe(true);
    expect(canTransition("FAILED", "AWAITING_PAYMENT", "provider")).toBe(false);
  });
});

describe("mock payment provider signatures", () => {
  const p = new MockProvider("x".repeat(40));
  const body = JSON.stringify({ id: "evt_1", ref: "mock_a", status: "succeeded", amount: "12000", currency: "TRY" });
  const h = (sig: string) => new Headers({ "x-mock-signature": sig });
  it("accepts a valid signature", () => {
    expect(p.verifyWebhook(body, h(p.sign(body))).valid).toBe(true);
  });
  it("rejects missing, forged, tampered and stale signatures", () => {
    expect(p.verifyWebhook(body, new Headers())).toEqual({ valid: false, reason: "missing_signature" });
    expect(p.verifyWebhook(body, h(new MockProvider("y".repeat(40)).sign(body)))).toEqual({ valid: false, reason: "bad_signature" });
    expect(p.verifyWebhook(body.replace("12000", "1"), h(p.sign(body)))).toEqual({ valid: false, reason: "bad_signature" });
    expect(p.verifyWebhook(body, h(p.sign(body, new Date(Date.now() - 3_600_000))))).toEqual({ valid: false, reason: "stale" });
    expect(p.verifyWebhook(body, h("t=1,v1=zz"))).toEqual({ valid: false, reason: "malformed" });
  });
});

describe("IBAN (Sprint 12)", () => {
  it("accepts checksum-valid TR IBANs, rejects placeholders and typos", async () => {
    const { isValidTrIban, formatIban } = await import("@/lib/commerce/iban");
    expect(isValidTrIban("TR33 0006 1005 1978 6457 8413 26")).toBe(true);
    expect(isValidTrIban("tr330006100519786457841326")).toBe(true);
    expect(isValidTrIban("TR00 0000 0000 0000 0000 0000 00")).toBe(false); // legacy page placeholder
    expect(isValidTrIban("TR330006100519786457841327")).toBe(false); // one digit off
    expect(isValidTrIban("DE89370400440532013000")).toBe(false);
    expect(formatIban("TR330006100519786457841326")).toBe("TR33 0006 1005 1978 6457 8413 26");
  });
});
