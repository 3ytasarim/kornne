import { writeAuditLog } from "@/lib/audit-log";
import { allowed } from "@/lib/auth/rbac";
import { getSessionUser } from "@/lib/auth/session";
import { requireDb } from "@/lib/db";
import { evaluateCatalog } from "@/lib/merchant/facts";
import { buildFeed, feedCsv, feedTsv, feedXml } from "@/lib/merchant/feed";
import { getIpHash } from "@/lib/request-meta";
import { getSiteUrl } from "@/lib/seo/site";

/**
 * Feed preview download (XML / TSV / CSV) — merchant.preview only (SUPER_ADMIN / ADMIN), session-authenticated,
 * no-store, noindex. It is a DRY-RUN file for inspection: it is not a public feed URL and Google never fetches it.
 * Only READY items are included (today: none).
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!allowed(user.role, "merchant.preview")) {
    await writeAuditLog({ actorId: user.id, action: "auth.denied", entityType: "Permission", entityId: "merchant.preview", ipHash: await getIpHash() });
    return new Response("Forbidden", { status: 403 });
  }
  const format = new URL(req.url).searchParams.get("format") ?? "xml";
  const { ctx, candidates } = await evaluateCatalog(requireDb());
  const feed = buildFeed(candidates, ctx);
  const at = new Date();
  await writeAuditLog({ actorId: user.id, action: "merchant.feed_previewed", entityType: "MerchantFeed", after: { format, items: feed.items.length, excluded: feed.excluded.length }, ipHash: await getIpHash() });
  const [body, type, ext] = format === "tsv" ? [feedTsv(feed.items), "text/tab-separated-values", "tsv"] : format === "csv" ? ["﻿" + feedCsv(feed.items), "text/csv", "csv"] : [feedXml(feed.items, { title: "KORNNE", link: getSiteUrl(), generatedAt: at }), "application/xml", "xml"];
  return new Response(body, {
    headers: { "Content-Type": `${type}; charset=utf-8`, "Content-Disposition": `attachment; filename="kornne-feed-ONIZLEME-GONDERILMEDI-${at.toISOString().slice(0, 10)}.${ext}"`, "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
  });
}
