import "server-only";
import type { PrismaClient } from "@prisma/client";
import { parseTcmbXml, type Rates } from "./convert";

/**
 * TCMB rates with a 5-minute refresh (client request 11.11.2026: "5 dakikada bir çeksin").
 *  - in-process memory cache, max age 5 minutes; one in-flight refresh at a time
 *  - pages never wait for TCMB (it can take 10+ s): the stored rate is returned at once and, when older than
 *    5 minutes, a background fetch (15 s timeout) updates it for the next request. Only the very first request
 *    (no stored rate yet) waits for TCMB.
 *  - TCMB unreachable → the last stored rate stays in use (`stale` after 3 days); nothing stored → null (no prices)
 *  - tests / offline previews: FX_FIXTURE="USD:34.1234,EUR:37.0123" (never contacts TCMB)
 * TCMB publishes one bulletin per business day (~15:30); weekends keep Friday's rates.
 */
const MAX_AGE_MS = 5 * 60_000;
const TCMB_URL = process.env.FX_TCMB_URL || "https://www.tcmb.gov.tr/kurlar/today.xml";

let memo: { rates: Rates | null; at: number } | null = null;
let inflight: Promise<Rates | null> | null = null;
let background: Promise<void> | null = null;

function fixture(): Rates | null {
  const raw = process.env.FX_FIXTURE;
  if (!raw) return null;
  const map = Object.fromEntries(raw.split(",").map((p) => p.split(":").map((x) => x.trim())));
  const r4 = (v?: string) => (v ? Math.round(Number(v) * 10_000) : 0);
  return { USD: r4(map.USD), EUR: r4(map.EUR), bulletinDate: "fixture", stale: false };
}

async function fetchTcmb(): Promise<{ USD: number; EUR: number; bulletinDate: string } | null> {
  try {
    // revalidating (not no-store) fetch: a no-store fetch inside an ISR page render (e.g. an unknown /page/<slug>) makes
    // Next abort the render with "static to dynamic" → 500. 300 s matches the memory cache age.
    const res = await fetch(TCMB_URL, { signal: AbortSignal.timeout(15_000), next: { revalidate: 300 }, headers: { "user-agent": "kornne.com fx" } });
    if (!res.ok) return null;
    return parseTcmbXml(await res.text());
  } catch {
    return null;
  }
}

async function refresh(db: Pick<PrismaClient, "fxRate"> | null): Promise<Rates | null> {
  const fx = fixture();
  if (fx) return fx;
  if (!db) return null;
  const rows = await db.fxRate.findMany({ where: { currency: { in: ["USD", "EUR"] } } }).catch(() => []);
  const usd = rows.find((r) => r.currency === "USD");
  const eur = rows.find((r) => r.currency === "EUR");
  const store = async (live: { USD: number; EUR: number; bulletinDate: string }) => {
    for (const c of ["USD", "EUR"] as const) {
      await db.fxRate
        .upsert({ where: { currency: c }, create: { currency: c, rate4: live[c], bulletinDate: live.bulletinDate }, update: { rate4: live[c], bulletinDate: live.bulletinDate, fetchedAt: new Date() } })
        .catch(() => {});
    }
  };
  if (usd && eur) {
    const age = Date.now() - Math.min(+usd.fetchedAt, +eur.fetchedAt);
    if (age >= MAX_AGE_MS && !background) {
      background = fetchTcmb()
        .then((live) => (live ? store(live) : undefined))
        .finally(() => {
          background = null;
          memo = null; // next request reads the new value
        });
    }
    return { USD: usd.rate4, EUR: eur.rate4, bulletinDate: usd.bulletinDate, stale: age > 3 * 86_400_000 };
  }
  // first run: nothing stored yet → wait for TCMB once
  const live = await fetchTcmb();
  if (!live) return null;
  await store(live);
  return { ...live, stale: false };
}

export async function getRates(db: Pick<PrismaClient, "fxRate"> | null): Promise<Rates | null> {
  if (memo && Date.now() - memo.at < MAX_AGE_MS) return memo.rates;
  inflight ??= refresh(db).finally(() => {
    inflight = null;
  });
  const rates = await inflight;
  // a failed first fetch is not cached: the next request tries again
  memo = rates ? { rates, at: Date.now() } : null;
  return rates;
}

/** Test hook: forget the memory cache. */
export function resetRatesMemo() {
  memo = null;
}
