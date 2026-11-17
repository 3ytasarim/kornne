import { finalizeCardPayment } from "@/lib/commerce/card-payments";
import { iyzicoConfig } from "@/lib/commerce/payments/iyzico";
import { requireDb } from "@/lib/db";
import { isEnabledLocale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/routes";
import { getSiteUrl } from "@/lib/seo/site";

export const dynamic = "force-dynamic";

/**
 * iyzico Checkout Form return: the customer's browser is POSTed here with `token` after the payment page. The posted
 * data is only a pointer — the result is fetched from iyzico and verified in finalizeCardPayment. The customer is then
 * sent (303) to the checkout page of their language with the outcome.
 */
async function tokenOf(req: Request): Promise<string> {
  const raw = (await req.text()).slice(0, 8_000);
  if ((req.headers.get("content-type") ?? "").includes("application/json")) {
    try {
      return String((JSON.parse(raw) as { token?: unknown }).token ?? "");
    } catch {
      return "";
    }
  }
  return new URLSearchParams(raw).get("token") ?? "";
}

export async function POST(req: Request) {
  const cfg = iyzicoConfig();
  if (!cfg) return Response.json({ error: "not_found" }, { status: 404 });
  const r = await finalizeCardPayment(requireDb(), cfg, await tokenOf(req));
  const locale = r.locale && isEnabledLocale(r.locale) ? r.locale : "en";
  const qs = new URLSearchParams({ sonuc: r.outcome === "paid" ? "ok" : r.outcome === "review" ? "review" : "fail", ...(r.orderNumber ? { no: r.orderNumber } : {}) });
  return Response.redirect(`${getSiteUrl()}${localizePath(locale, "/odeme")}?${qs}`, 303);
}
