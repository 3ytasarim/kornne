import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { productInputName } from "./transform";
import { MerchantApiError, MerchantDisabledError, type MerchantClient, type MerchantTarget, type ProductInput } from "./types";

/**
 * Real Merchant API client — DISABLED BY DEFAULT. It can only be constructed when ALL of these hold:
 *  - MERCHANT_API_ENABLED=true (explicit opt-in per environment)
 *  - the target account is on MERCHANT_ACCOUNT_ALLOWLIST
 *  - service-account credentials are configured (email + private key FILE path; never the key in .env)
 *  - SECRETS_ROTATION_CONFIRMED=true (the exposed Neon password was rotated — no new external connection before)
 *  - not a test process (KORNNE_TEST_DB / NODE_ENV=test → mock only)
 * In Sprint 9 none of these are set: the client is never created and nothing is sent to Google.
 */
export const MERCHANT_API_BASE = "https://merchantapi.googleapis.com";
export const MERCHANT_SCOPE = "https://www.googleapis.com/auth/content";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

type Env = Partial<Record<string, string | undefined>>;

export function merchantApiStatus(accountId: string | null, env: Env = process.env): { enabled: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (env.MERCHANT_API_ENABLED !== "true") reasons.push("MERCHANT_API_ENABLED açık değil (varsayılan: kapalı)");
  const allow = (env.MERCHANT_ACCOUNT_ALLOWLIST ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!accountId) reasons.push("Merchant hesap no doğrulanmadı");
  else if (!allow.includes(accountId)) reasons.push("hesap MERCHANT_ACCOUNT_ALLOWLIST içinde değil");
  if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE) reasons.push("servis hesabı kimlik bilgisi tanımlı değil");
  if (env.SECRETS_ROTATION_CONFIRMED !== "true") reasons.push("ifşa olan Neon parolasının yenilendiği doğrulanmadı");
  if (env.KORNNE_TEST_DB || env.NODE_ENV === "test") reasons.push("test ortamı: yalnız MOCK");
  return { enabled: reasons.length === 0, reasons };
}

/** Service-account JWT bearer flow (RFC 7523) with an in-memory token cache. */
export class ServiceAccountTokenProvider {
  private cached: { token: string; exp: number } | null = null;
  constructor(
    private readonly email: string,
    private readonly privateKeyPem: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  assertion(): string {
    const iat = Math.floor(this.now() / 1000);
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iss: this.email, scope: MERCHANT_SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600 })}`;
    const sig = createSign("RSA-SHA256").update(unsigned).sign(this.privateKeyPem).toString("base64url");
    return `${unsigned}.${sig}`;
  }

  async token(): Promise<string> {
    if (this.cached && this.cached.exp - 60_000 > this.now()) return this.cached.token;
    const res = await this.fetchImpl(TOKEN_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: this.assertion() }), signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new MerchantApiError(`token endpoint HTTP ${res.status}`, res.status, null, res.status >= 500);
    const body = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw new MerchantApiError("token endpoint: no access_token", 500, null, false);
    this.cached = { token: body.access_token, exp: this.now() + (body.expires_in ?? 3600) * 1000 };
    return body.access_token;
  }
}

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

/** google.rpc.Status → MerchantApiError (message trimmed; the response body is never logged in full). */
export async function parseError(res: Response): Promise<MerchantApiError> {
  let status: string | null = null;
  let message = `HTTP ${res.status}`;
  try {
    const j = (await res.json()) as { error?: { status?: string; message?: string } };
    status = j.error?.status ?? null;
    if (j.error?.message) message = j.error.message.slice(0, 300);
  } catch {
    /* non-JSON */
  }
  const ra = res.headers.get("retry-after");
  const retryAfterMs = ra ? (/^\d+$/.test(ra) ? Number(ra) * 1000 : Math.max(0, Date.parse(ra) - Date.now())) : null;
  return new MerchantApiError(message, res.status, status, RETRYABLE.has(res.status), retryAfterMs);
}

export type RetryPolicy = { attempts: number; baseMs: number; maxMs: number; timeoutMs: number };
export const DEFAULT_RETRY: RetryPolicy = { attempts: 4, baseMs: 500, maxMs: 16_000, timeoutMs: 15_000 };

/** Retries 408/429/5xx and network/timeout errors with exponential backoff + jitter, honouring Retry-After. */
export async function withRetry<T>(fn: () => Promise<T>, policy: RetryPolicy = DEFAULT_RETRY, sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)), random: () => number = Math.random): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < policy.attempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const retryable = e instanceof MerchantApiError ? e.retryable : e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError" || e.name === "TypeError");
      if (!retryable || attempt === policy.attempts - 1) throw e;
      const backoff = Math.min(policy.maxMs, policy.baseMs * 2 ** attempt) * (0.5 + random() / 2);
      await sleep(e instanceof MerchantApiError && e.retryAfterMs !== null ? Math.min(policy.maxMs, e.retryAfterMs) : backoff);
    }
  }
  throw last;
}

export class HttpMerchantClient implements MerchantClient {
  readonly kind = "http" as const;
  constructor(
    private readonly tokens: { token(): Promise<string> },
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly policy: RetryPolicy = DEFAULT_RETRY,
    private readonly sleep?: (ms: number) => Promise<void>,
  ) {}

  private async call<T>(method: string, path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
    return withRetry(
      async () => {
        const res = await this.fetchImpl(`${MERCHANT_API_BASE}${path}`, {
          method,
          headers: { authorization: `Bearer ${await this.tokens.token()}`, "content-type": "application/json", ...(idempotencyKey ? { "x-goog-request-id": idempotencyKey } : {}) },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(this.policy.timeoutMs),
        });
        if (!res.ok) throw await parseError(res);
        return (res.status === 204 ? undefined : await res.json().catch(() => undefined)) as T;
      },
      this.policy,
      this.sleep,
    );
  }

  insertProductInput(t: MerchantTarget, input: ProductInput, opts?: { idempotencyKey?: string }) {
    const ds = encodeURIComponent(`accounts/${t.accountId}/dataSources/${t.dataSourceId}`);
    return this.call<ProductInput>("POST", `/products/v1/accounts/${t.accountId}/productInputs:insert?dataSource=${ds}`, input, opts?.idempotencyKey);
  }

  async deleteProductInput(t: MerchantTarget, ref: { offerId: string; contentLanguage: string; feedLabel: string }) {
    const ds = encodeURIComponent(`accounts/${t.accountId}/dataSources/${t.dataSourceId}`);
    await this.call<void>("DELETE", `/products/v1/${productInputName(t.accountId, ref)}?dataSource=${ds}`);
  }

  async listDataSources(accountId: string) {
    const r = await this.call<{ dataSources?: { name: string; displayName?: string; input?: string }[] }>("GET", `/datasources/v1/accounts/${accountId}/dataSources`);
    return r?.dataSources ?? [];
  }
}

/** Factory: throws MerchantDisabledError unless every opt-in condition holds (see header). */
export function createMerchantClient(accountId: string | null, env: Env = process.env): MerchantClient {
  const s = merchantApiStatus(accountId, env);
  if (!s.enabled) throw new MerchantDisabledError(s.reasons);
  const pem = readFileSync(env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE!, "utf8");
  return new HttpMerchantClient(new ServiceAccountTokenProvider(env.GOOGLE_SERVICE_ACCOUNT_EMAIL!, pem));
}
