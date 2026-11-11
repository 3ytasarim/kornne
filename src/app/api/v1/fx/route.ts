import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRates } from "@/lib/fx/rates";

/** Current TCMB ForexSelling rates for the header ticker (polled every 5 minutes by the browser). Public, no PII. */
export const dynamic = "force-dynamic";

export async function GET() {
  const r = await getRates(prisma);
  if (!r) return NextResponse.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ ok: true, usd: r.USD, eur: r.EUR, date: r.bulletinDate, stale: r.stale }, { headers: { "Cache-Control": "public, max-age=60" } });
}
