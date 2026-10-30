/**
 * Money helpers. Amounts are integer minor units (kuruş) as bigint — no floating point anywhere.
 * Display: TR "1.234,56 TL"; Merchant/JSON-LD: "1234.56".
 */
import { LOCALE_META, type Locale } from "@/lib/i18n/config";

/** "1807479.94" | "1.807.479,94 TL" → 180747994n. Returns null for anything that is not a clean amount. */
export function parseMinor(input: string | null | undefined): bigint | null {
  if (!input) return null;
  const s = input.replace(/\s|TL|₺|TRY/g, "");
  let m = s.match(/^(\d+)(?:\.(\d{1,2}))?$/); // "1807479.94"
  if (!m) {
    m = s.match(/^(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?$/); // "1.807.479,94"
    if (!m) return null;
    m = [m[0], m[1]!.replace(/\./g, ""), m[2]] as unknown as RegExpMatchArray;
  }
  const whole = BigInt(m[1]!);
  const frac = BigInt((m[2] ?? "0").padEnd(2, "0"));
  return whole * 100n + frac;
}

/** 180747994n → "1807479.94" (schema.org / Merchant decimal string) */
export function toDecimalString(minor: bigint): string {
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  return `${neg ? "-" : ""}${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
}

/** Locale-aware display. Uses Intl on the decimal string (no float rounding for realistic catalog values). */
export function formatMoney(minor: bigint, currency = "TRY", locale: Locale = "tr"): string {
  const parts = new Intl.NumberFormat(LOCALE_META[locale].intl, { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 })
    // Intl accepts decimal strings exactly (ES2023 "string as exact decimal" for NumberFormat v3)
    .format(toDecimalString(minor) as unknown as number);
  return locale === "tr" ? parts.replace("₺", "").trim() + " TL" : parts;
}

/**
 * Discount percentage, only when the "was" price is really higher than the selling price.
 * Legacy shop showed "-%-19" and "%0" labels — those cases return null here (no label).
 */
export function discountPercent(price: bigint | null, compareAt: bigint | null): number | null {
  if (price === null || compareAt === null || compareAt <= price || price <= 0n) return null;
  const pct = Number(((compareAt - price) * 100n) / compareAt);
  return pct >= 1 ? pct : null;
}
