import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Liveness/readiness for Nginx/PM2/uptime monitors. Exposes no internals (no versions, hosts or error text).
 * 200 when the app runs and (if configured) the database answers; 503 otherwise.
 */
export async function GET() {
  let db: "ok" | "down" | "not_configured" = "not_configured";
  if (prisma) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      db = "ok";
    } catch {
      db = "down";
    }
  }
  const ok = db !== "down";
  return Response.json({ status: ok ? "ok" : "degraded", db }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}
