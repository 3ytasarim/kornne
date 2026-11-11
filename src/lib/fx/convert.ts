/**
 * Currency conversion for display and orders (integer minor units, no floating point).
 * Rates are TCMB ForexSelling as "TRY per 1 unit × 10000" (rate4), e.g. 34.1234 TRY/USD → 341234.
 * Rule (client decision 11.11.2026): Turkish pages show TRY, every other language shows USD.
 */
export type FxCurrency = "TRY" | "USD" | "EUR";
export type Rates = { USD: number; EUR: number; bulletinDate: string; stale: boolean };

export const displayCurrency = (locale: string): FxCurrency => (locale === "tr" ? "TRY" : "USD");

/** round(a / b) half-up for non-negative bigints */
const div = (a: bigint, b: bigint) => (a * 2n + b) / (b * 2n);

/**
 * Converts an amount between TRY / USD / EUR via the TRY rates. Returns null when a needed rate is missing
 * (callers then show "price on request" instead of a wrong number).
 */
export function convertMinor(amountMinor: bigint, from: string, to: string, rates: Pick<Rates, "USD" | "EUR"> | null): bigint | null {
  if (from === to) return amountMinor;
  if (!rates) return null;
  const r = (c: string) => (c === "USD" ? rates.USD : c === "EUR" ? rates.EUR : c === "TRY" ? 10_000 : 0);
  const rf = r(from);
  const rt = r(to);
  if (!rf || !rt || amountMinor < 0n) return null;
  // amount(from) × rate(from→TRY) / rate(to→TRY)
  return div(amountMinor * BigInt(rf), BigInt(rt));
}

/** "34.1234" | "34,1234" → 341234 (4 decimals, as TCMB publishes) */
export function parseRate4(s: string): number | null {
  const m = s.trim().replace(",", ".").match(/^(\d{1,6})(?:\.(\d{1,6}))?$/);
  if (!m) return null;
  const n = Number(m[1]) * 10_000 + Number((m[2] ?? "").padEnd(4, "0").slice(0, 4));
  return n > 0 ? n : null;
}

/** TCMB today.xml → ForexSelling for USD and EUR + bulletin date ("11.11.2026"). */
export function parseTcmbXml(xml: string): { USD: number; EUR: number; bulletinDate: string } | null {
  const date = xml.match(/Tarih="([^"]+)"/)?.[1] ?? "";
  const pick = (code: string) => {
    const block = xml.match(new RegExp(`<Currency[^>]*CurrencyCode="${code}"[^>]*>([\\s\\S]*?)</Currency>`))?.[1];
    const v = block?.match(/<ForexSelling>([^<]*)<\/ForexSelling>/)?.[1];
    return v ? parseRate4(v) : null;
  };
  const USD = pick("USD");
  const EUR = pick("EUR");
  return USD && EUR && date ? { USD, EUR, bulletinDate: date } : null;
}
