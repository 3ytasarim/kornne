import { productInputName } from "./transform";
import { MerchantApiError, type MerchantClient, type MerchantTarget, type ProductInput } from "./types";

/**
 * In-memory Merchant API stand-in (results are labelled MOCK everywhere). Mirrors the real semantics that matter for
 * the adapter: insert = upsert by (offerId, contentLanguage, feedLabel), delete of a missing item = 404, invalid
 * offerId = 400, scripted transient failures (429 / 500 / timeout) to exercise retry, idempotency keys deduplicated.
 */
export class MockMerchantClient implements MerchantClient {
  readonly kind = "mock" as const;
  readonly store = new Map<string, ProductInput>();
  readonly calls: { op: string; key?: string; status: number | "timeout" }[] = [];
  private script: (number | "timeout")[] = [];
  private seenKeys = new Map<string, ProductInput>();
  authOk = true;

  /** Next N calls fail with these statuses (then succeed). */
  failNext(...statuses: (number | "timeout")[]) {
    this.script.push(...statuses);
    return this;
  }

  private gate(op: string, key?: string) {
    if (!this.authOk) {
      this.calls.push({ op, key, status: 401 });
      throw new MerchantApiError("Request had invalid authentication credentials.", 401, "UNAUTHENTICATED", false);
    }
    const s = this.script.shift();
    if (s === "timeout") {
      this.calls.push({ op, key, status: "timeout" });
      const e = new Error("The operation was aborted due to timeout");
      e.name = "TimeoutError";
      throw e;
    }
    if (s !== undefined) {
      this.calls.push({ op, key, status: s });
      throw new MerchantApiError(s === 429 ? "Quota exceeded" : `HTTP ${s}`, s, s === 429 ? "RESOURCE_EXHAUSTED" : "INTERNAL", [408, 429, 500, 502, 503, 504].includes(s), s === 429 ? 10 : null);
    }
  }

  async insertProductInput(t: MerchantTarget, input: ProductInput, opts?: { idempotencyKey?: string }) {
    this.gate("insert", input.offerId);
    if (opts?.idempotencyKey && this.seenKeys.has(opts.idempotencyKey)) {
      this.calls.push({ op: "insert-dedup", key: input.offerId, status: 200 });
      return this.seenKeys.get(opts.idempotencyKey)!;
    }
    if (!/^[\x21-\x7e]{1,50}$/.test(input.offerId)) {
      this.calls.push({ op: "insert", key: input.offerId, status: 400 });
      throw new MerchantApiError("offerId is invalid", 400, "INVALID_ARGUMENT", false);
    }
    const name = productInputName(t.accountId, input);
    const saved = { ...input, name, product: name.replace("/productInputs/", "/products/") };
    this.store.set(name, saved);
    if (opts?.idempotencyKey) this.seenKeys.set(opts.idempotencyKey, saved);
    this.calls.push({ op: "insert", key: input.offerId, status: 200 });
    return saved;
  }

  async deleteProductInput(t: MerchantTarget, ref: { offerId: string; contentLanguage: string; feedLabel: string }) {
    this.gate("delete", ref.offerId);
    const name = productInputName(t.accountId, ref);
    if (!this.store.delete(name)) {
      this.calls.push({ op: "delete", key: ref.offerId, status: 404 });
      throw new MerchantApiError("Requested entity was not found.", 404, "NOT_FOUND", false);
    }
    this.calls.push({ op: "delete", key: ref.offerId, status: 200 });
  }

  async listDataSources(accountId: string) {
    this.gate("listDataSources");
    this.calls.push({ op: "listDataSources", status: 200 });
    return [{ name: `accounts/${accountId}/dataSources/MOCK-1`, displayName: "MOCK data source", input: "API" }];
  }
}
