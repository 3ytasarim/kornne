"use server";

import { requireDb } from "@/lib/db";
import { createQuoteRequest, type QuoteResult } from "@/lib/quote/service";
import type { QuoteInput } from "@/lib/quote/validation";
import { getIpHash } from "@/lib/request-meta";

/**
 * Storefront quote submission. Server Actions are POST-only and Next.js rejects cross-origin calls (Origin/Host
 * check) → CSRF-safe. Everything is re-validated in createQuoteRequest; errors never echo input or internals.
 */
export async function submitQuoteAction(input: QuoteInput): Promise<QuoteResult> {
  try {
    return await createQuoteRequest(requireDb(), input, { ipHash: await getIpHash() });
  } catch {
    return { ok: false, code: "error" };
  }
}
