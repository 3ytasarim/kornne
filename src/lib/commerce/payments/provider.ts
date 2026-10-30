import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Payment provider contract (docs/architecture/order-payment-contract.md). No real provider is selected; the
 * MockProvider exists for isolated tests only (blocked by the commerce gate outside NODE_ENV=test).
 */
export type WebhookEvent = { eventId: string; providerRef: string; status: "succeeded" | "failed"; amountMinor: bigint; currency: string };
export type VerifyResult = { valid: true; event: WebhookEvent } | { valid: false; reason: "missing_signature" | "bad_signature" | "stale" | "malformed" };

export interface PaymentProvider {
  readonly name: string;
  /** Creates a payment at the provider for an attempt; returns the provider reference (+ redirect for 3-D Secure). */
  createPayment(input: { attemptId: string; amountMinor: bigint; currency: string; returnUrl: string }): Promise<{ providerRef: string; redirectUrl: string | null }>;
  /** Verifies the raw callback body + headers. Must be constant-time and reject stale timestamps. */
  verifyWebhook(rawBody: string, headers: Headers, now?: Date): VerifyResult;
}

const TOLERANCE_S = 300;

/** HMAC-SHA256 signed mock ("x-mock-signature: t=<unix>,v1=<hex>") — same shape as common providers' schemes. */
export class MockProvider implements PaymentProvider {
  readonly name = "mock";
  constructor(private readonly secret: string) {
    if (!secret || secret.length < 32) throw new Error("mock provider secret must be >= 32 chars");
  }

  async createPayment(input: { attemptId: string }) {
    return { providerRef: `mock_${input.attemptId}`, redirectUrl: null };
  }

  sign(rawBody: string, at = new Date()): string {
    const t = Math.floor(at.getTime() / 1000);
    const v1 = createHmac("sha256", this.secret).update(`${t}.${rawBody}`).digest("hex");
    return `t=${t},v1=${v1}`;
  }

  verifyWebhook(rawBody: string, headers: Headers, now = new Date()): VerifyResult {
    const header = headers.get("x-mock-signature");
    if (!header) return { valid: false, reason: "missing_signature" };
    const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
    const t = Number(parts.t);
    if (!Number.isFinite(t) || !parts.v1 || !/^[a-f0-9]{64}$/.test(parts.v1)) return { valid: false, reason: "malformed" };
    if (Math.abs(now.getTime() / 1000 - t) > TOLERANCE_S) return { valid: false, reason: "stale" };
    const expected = createHmac("sha256", this.secret).update(`${t}.${rawBody}`).digest();
    const got = Buffer.from(parts.v1, "hex");
    if (got.length !== expected.length || !timingSafeEqual(got, expected)) return { valid: false, reason: "bad_signature" };
    try {
      const j = JSON.parse(rawBody) as { id?: unknown; ref?: unknown; status?: unknown; amount?: unknown; currency?: unknown };
      if (typeof j.id !== "string" || typeof j.ref !== "string" || (j.status !== "succeeded" && j.status !== "failed") || typeof j.amount !== "string" || !/^\d{1,15}$/.test(j.amount) || typeof j.currency !== "string") return { valid: false, reason: "malformed" };
      return { valid: true, event: { eventId: j.id, providerRef: j.ref, status: j.status, amountMinor: BigInt(j.amount), currency: j.currency } };
    } catch {
      return { valid: false, reason: "malformed" };
    }
  }
}
