import { finalizeCardPayment } from "@/lib/commerce/card-payments";
import { iyzicoConfig, webhookSignatureValid, type WebhookBody } from "@/lib/commerce/payments/iyzico";
import { requireDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * iyzico merchant notification (X-IYZ-SIGNATURE-V3) — settles card payments whose customer never came back to the
 * callback (closed tab, lost connection) and fraud reviews decided later. The signature is checked, then the result
 * is fetched from iyzico exactly like the callback (the notification body itself is never trusted for amounts).
 * URL to enter in the iyzico panel (Ayarlar › Firma Ayarları › Bildirimler): https://kornne.com/api/v1/payments/iyzico/webhook
 */
export async function POST(req: Request) {
  const cfg = iyzicoConfig();
  if (!cfg) return Response.json({ error: "not_found" }, { status: 404 });
  const raw = await req.text();
  if (raw.length > 16_000) return Response.json({ error: "too_large" }, { status: 413 });
  let body: WebhookBody;
  try {
    body = JSON.parse(raw) as WebhookBody;
  } catch {
    return Response.json({ error: "malformed" }, { status: 400 });
  }
  if (!webhookSignatureValid(cfg.secretKey, body, req.headers.get("x-iyz-signature-v3"))) return Response.json({ error: "signature" }, { status: 401 });
  if (!body.token) return Response.json({ received: true });
  const r = await finalizeCardPayment(requireDb(), cfg, String(body.token));
  // 2xx stops iyzico's retries; "unknown" = not one of our checkout-form payments
  return Response.json({ received: true, outcome: r.outcome });
}
