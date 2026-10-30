/**
 * Paid-checkout gate (docs/architecture/commerce-modes.md). The feature flag ALONE never opens checkout: every
 * commercial prerequisite must be configured and confirmed, and each product still needs a VERIFIED price with a
 * known VAT treatment (checked per product in cart/order services).
 */
export type CommerceEnv = Partial<Record<string, string | undefined>>;
export type GateResult = { enabled: boolean; blockers: string[] };

export const GATE_BLOCKERS = {
  flag: "ENABLE_PAID_CHECKOUT is not 'true'",
  seller: "legal seller identity (COMMERCE_SELLER_LEGAL_NAME + COMMERCE_SELLER_TAX_ID) not configured",
  vat: "VAT treatment (COMMERCE_VAT_MODE=included|excluded + COMMERCE_VAT_RATE_BP) not confirmed",
  shipping: "shipping / installation rules not approved (COMMERCE_SHIPPING_APPROVED)",
  legal: "distance-sales / return / privacy texts not legally approved (COMMERCE_LEGAL_APPROVED)",
  provider: "no live payment provider configured (PAYMENT_PROVIDER)",
  mockInProd: "mock payment provider is only allowed in tests",
} as const;

export function commerceGate(env: CommerceEnv = process.env): GateResult {
  const blockers: string[] = [];
  if (env.ENABLE_PAID_CHECKOUT !== "true") blockers.push(GATE_BLOCKERS.flag);
  if (!env.COMMERCE_SELLER_LEGAL_NAME || !env.COMMERCE_SELLER_TAX_ID) blockers.push(GATE_BLOCKERS.seller);
  if (!["included", "excluded"].includes(env.COMMERCE_VAT_MODE ?? "") || !/^\d{1,5}$/.test(env.COMMERCE_VAT_RATE_BP ?? "")) blockers.push(GATE_BLOCKERS.vat);
  if (env.COMMERCE_SHIPPING_APPROVED !== "true") blockers.push(GATE_BLOCKERS.shipping);
  if (env.COMMERCE_LEGAL_APPROVED !== "true") blockers.push(GATE_BLOCKERS.legal);
  if (!env.PAYMENT_PROVIDER) blockers.push(GATE_BLOCKERS.provider);
  if (env.PAYMENT_PROVIDER === "mock" && env.NODE_ENV !== "test") blockers.push(GATE_BLOCKERS.mockInProd);
  return { enabled: blockers.length === 0, blockers };
}

/** Test-only environment that satisfies the gate with the mock provider (used by the isolated integration tests). */
export const TEST_COMMERCE_ENV: CommerceEnv = {
  NODE_ENV: "test",
  ENABLE_PAID_CHECKOUT: "true",
  COMMERCE_SELLER_LEGAL_NAME: "TEST SELLER (fixture)",
  COMMERCE_SELLER_TAX_ID: "0000000000",
  COMMERCE_VAT_MODE: "included",
  COMMERCE_VAT_RATE_BP: "2000",
  COMMERCE_SHIPPING_APPROVED: "true",
  COMMERCE_LEGAL_APPROVED: "true",
  PAYMENT_PROVIDER: "mock",
};
