/**
 * Order arithmetic in integer minor units (kuruş, bigint) — exact, no floating point. VAT rounding is half-up per
 * line (Turkish e-invoice practice is per-line rounding; to be confirmed with the client's accountant).
 * vatRateBp = basis points (2000 = 20 %).
 */
export type TotalsLine = { unitPriceMinor: bigint; quantity: number; vatRateBp: number; vatIncluded: boolean };
export type Totals = { netMinor: bigint; vatMinor: bigint; grossMinor: bigint; shippingMinor: bigint; totalMinor: bigint };

export const MAX_LINE_QTY = 999;

/** round(a / b) half-up for non-negative bigints */
export function divRoundHalfUp(a: bigint, b: bigint): bigint {
  if (b <= 0n || a < 0n) throw new RangeError("divRoundHalfUp expects a >= 0, b > 0");
  return (a * 2n + b) / (b * 2n);
}

export function lineTotals(l: TotalsLine): { net: bigint; vat: bigint; gross: bigint } {
  if (!Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > MAX_LINE_QTY) throw new RangeError("invalid quantity");
  if (l.unitPriceMinor <= 0n) throw new RangeError("invalid unit price");
  if (!Number.isInteger(l.vatRateBp) || l.vatRateBp < 0 || l.vatRateBp > 10_000) throw new RangeError("invalid VAT rate");
  const amount = l.unitPriceMinor * BigInt(l.quantity);
  const rate = BigInt(l.vatRateBp);
  if (l.vatIncluded) {
    const vat = divRoundHalfUp(amount * rate, 10_000n + rate);
    return { net: amount - vat, vat, gross: amount };
  }
  const vat = divRoundHalfUp(amount * rate, 10_000n);
  return { net: amount, vat, gross: amount + vat };
}

export function computeTotals(lines: TotalsLine[], shippingMinor = 0n): Totals {
  if (!lines.length) throw new RangeError("empty order");
  if (shippingMinor < 0n) throw new RangeError("invalid shipping");
  let net = 0n;
  let vat = 0n;
  let gross = 0n;
  for (const l of lines) {
    const t = lineTotals(l);
    net += t.net;
    vat += t.vat;
    gross += t.gross;
  }
  return { netMinor: net, vatMinor: vat, grossMinor: gross, shippingMinor, totalMinor: gross + shippingMinor };
}
