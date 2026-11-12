/**
 * Shipping charge (client decision 12.11.2026): Turkish (TRY) orders carry no shipping line; every foreign (USD)
 * order pays one flat freight charge of USD 100 per order. The same amount is sent to Google Merchant Center
 * (feed `shipping` attribute), so the listing, the cart and the order always agree.
 */
export const FOREIGN_FLAT_SHIPPING_MINOR = 100_00n;
export const FOREIGN_SHIPPING_CURRENCY = "USD";

/** Shipping for an order in `currency` (minor units). */
export function shippingFor(currency: string): bigint {
  return currency === FOREIGN_SHIPPING_CURRENCY ? FOREIGN_FLAT_SHIPPING_MINOR : 0n;
}

/** Google Shopping target market for USD sales (client 12.11.2026) and the published return window (Return & Refund Policy). */
export const FOREIGN_TARGET_COUNTRY = "US";
export const RETURN_WINDOW_DAYS = 15;
