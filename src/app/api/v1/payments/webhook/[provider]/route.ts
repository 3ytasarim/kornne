import { commerceGate } from "@/lib/commerce/gate";
import { MockProvider, type PaymentProvider } from "@/lib/commerce/payments/provider";
import { processWebhook } from "@/lib/commerce/service";
import { requireDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Payment provider callback. While paid checkout is locked (commerce gate) this endpoint does not exist (404).
 * No live provider is registered; the mock provider is only constructed under NODE_ENV=test.
 */
function providerFor(name: string): PaymentProvider | null {
  if (name === "mock" && process.env.NODE_ENV === "test" && process.env.MOCK_PAYMENT_SECRET) return new MockProvider(process.env.MOCK_PAYMENT_SECRET);
  return null;
}

export async function POST(req: Request, ctx: RouteContext<"/api/v1/payments/webhook/[provider]">) {
  const gate = commerceGate();
  const { provider: name } = await ctx.params;
  const provider = providerFor(name);
  if (!gate.enabled || !provider) return Response.json({ error: "not_found" }, { status: 404 });
  const raw = await req.text();
  if (raw.length > 64_000) return Response.json({ error: "too_large" }, { status: 413 });
  const result = await processWebhook(requireDb(), gate, provider, raw, req.headers);
  // response carries no internal details
  return Response.json({ received: result.httpStatus === 200 }, { status: result.httpStatus });
}
