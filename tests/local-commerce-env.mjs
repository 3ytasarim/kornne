/**
 * LOCAL PREVIEW ONLY (Sprint 12): opens the EFT/Havale checkout on the noindex dev build (:3470) against the local DB copy
 * so the order flow can be designed and tested. Seller identity / approvals here are placeholders, NOT production values —
 * production keeps the gate closed until the real values and legal approvals exist (docs/deployment/go-no-go.md).
 * The prodlike build (:3471) deliberately does NOT get these → it keeps testing the locked state.
 */
export const LOCAL_COMMERCE_ENV = {
  ENABLE_PAID_CHECKOUT: "true",
  COMMERCE_SELLER_LEGAL_NAME: "Mezbaha Teknolojileri A.Ş. (yerel önizleme)",
  COMMERCE_SELLER_TAX_ID: "LOCAL-PREVIEW",
  COMMERCE_VAT_MODE: "included",
  COMMERCE_VAT_RATE_BP: "2000",
  COMMERCE_SHIPPING_APPROVED: "true",
  COMMERCE_LEGAL_APPROVED: "true",
  PAYMENT_PROVIDER: "bank_transfer",
};
