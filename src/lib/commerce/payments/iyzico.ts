import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * iyzico Checkout Form (hosted payment page) over HTTPS, no SDK (docs.iyzico.com, checked 17.11.2026):
 *  - auth "IYZWSv2": HMAC-SHA256(randomKey + uriPath + body, secretKey) hex → base64("apiKey:..&randomKey:..&signature:..")
 *  - initialize: POST /payment/iyzipos/checkoutform/initialize/auth/ecom → token + paymentPageUrl
 *  - the customer pays on iyzico's page (card data never reaches us); iyzico POSTs `token` to our callbackUrl
 *  - retrieve: POST /payment/iyzipos/checkoutform/auth/ecom/detail — the ONLY source of truth for the result; its
 *    response signature is verified (paymentStatus:paymentId:currency:basketId:conversationId:paidPrice:price:token)
 *  - webhook (optional, X-IYZ-SIGNATURE-V3): secretKey + iyziEventType + iyziPaymentId + token + paymentConversationId + status
 * Card payment is OFF unless ENABLE_CARD_PAYMENT=true and both keys + an official base URL are configured.
 */
export type IyzicoConfig = { apiKey: string; secretKey: string; baseUrl: string; sandbox: boolean };
type Env = Partial<Record<string, string | undefined>>;

const BASE_URLS = ["https://api.iyzipay.com", "https://sandbox-api.iyzipay.com"];
export const INIT_PATH = "/payment/iyzipos/checkoutform/initialize/auth/ecom";
export const RETRIEVE_PATH = "/payment/iyzipos/checkoutform/auth/ecom/detail";

export function iyzicoConfig(env: Env = process.env): IyzicoConfig | null {
  if (env.ENABLE_CARD_PAYMENT !== "true") return null;
  const apiKey = env.IYZICO_API_KEY?.trim();
  const secretKey = env.IYZICO_SECRET_KEY?.trim();
  const baseUrl = env.IYZICO_BASE_URL?.trim().replace(/\/+$/, "");
  if (!apiKey || !secretKey || !baseUrl || !BASE_URLS.includes(baseUrl)) return null;
  return { apiKey, secretKey, baseUrl, sandbox: baseUrl.includes("sandbox") };
}

const hmacHex = (key: string, data: string) => createHmac("sha256", key).update(data, "utf8").digest("hex");

/** Constant-time comparison of two hex strings. */
export function sameHex(a: string, b: string): boolean {
  if (!/^[a-f0-9]+$/i.test(a) || !/^[a-f0-9]+$/i.test(b) || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a.toLowerCase(), "hex"), Buffer.from(b.toLowerCase(), "hex"));
}

export function authHeaders(cfg: Pick<IyzicoConfig, "apiKey" | "secretKey">, path: string, body: string, randomKey = `${Date.now()}${randomBytes(8).toString("hex")}`) {
  const signature = hmacHex(cfg.secretKey, randomKey + path + body);
  const token = Buffer.from(`apiKey:${cfg.apiKey}&randomKey:${randomKey}&signature:${signature}`, "utf8").toString("base64");
  return { Authorization: `IYZWSv2 ${token}`, "x-iyzi-rnd": randomKey, "Content-Type": "application/json", Accept: "application/json" };
}

/** Minor units → iyzico decimal string ("1890.00"). */
export function toPrice(minor: bigint): string {
  if (minor < 0n) throw new Error("negative amount");
  return `${minor / 100n}.${(minor % 100n).toString().padStart(2, "0")}`;
}

/** iyzico decimal (number or string) → minor units; null if not an exact 2-decimal amount. */
export function priceToMinor(v: unknown): bigint | null {
  const s = typeof v === "number" ? String(v) : typeof v === "string" ? v.trim() : "";
  const m = s.match(/^(\d{1,13})(?:\.(\d{1,8}))?$/);
  if (!m) return null;
  const frac = m[2] ?? "";
  if (frac.length > 2 && /[1-9]/.test(frac.slice(2))) return null;
  return BigInt(m[1]!) * 100n + BigInt(frac.slice(0, 2).padEnd(2, "0"));
}

/** Signature rule: prices without trailing zeros ("50.00" → "50", "10.50" → "10.5"). */
export function normalizePrice(v: unknown): string {
  const s = String(v ?? "");
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}

export type RetrieveResult = {
  status?: string;
  errorCode?: string;
  errorMessage?: string;
  paymentStatus?: string;
  paymentId?: string | number;
  fraudStatus?: number;
  price?: number | string;
  paidPrice?: number | string;
  currency?: string;
  basketId?: string;
  conversationId?: string;
  token?: string;
  signature?: string;
  installment?: number;
  cardAssociation?: string;
  lastFourDigits?: string;
  itemTransactions?: { itemId?: string; paymentTransactionId?: string | number; paidPrice?: number | string; transactionStatus?: number }[];
};

export function retrieveSignatureValid(secretKey: string, r: RetrieveResult): boolean {
  if (!r.signature) return false;
  const data = [r.paymentStatus, r.paymentId, r.currency, r.basketId, r.conversationId, normalizePrice(r.paidPrice), normalizePrice(r.price), r.token].map((x) => String(x ?? "")).join(":");
  return sameHex(hmacHex(secretKey, data), r.signature);
}

export function initSignatureValid(secretKey: string, r: { conversationId?: string; token?: string; signature?: string }): boolean {
  if (!r.signature) return false;
  return sameHex(hmacHex(secretKey, `${r.conversationId ?? ""}:${r.token ?? ""}`), r.signature);
}

export type WebhookBody = { paymentConversationId?: string; merchantId?: string | number; token?: string; status?: string; iyziReferenceCode?: string; iyziEventType?: string; iyziEventTime?: number; iyziPaymentId?: string | number };

export function webhookSignatureValid(secretKey: string, b: WebhookBody, header: string | null): boolean {
  if (!header) return false;
  const data = `${secretKey}${b.iyziEventType ?? ""}${b.iyziPaymentId ?? ""}${b.token ?? ""}${b.paymentConversationId ?? ""}${b.status ?? ""}`;
  return sameHex(hmacHex(secretKey, data), header.trim());
}

type Fetch = typeof fetch;

async function call<T>(cfg: IyzicoConfig, path: string, payload: object, fetchImpl: Fetch): Promise<T> {
  const body = JSON.stringify(payload); // signed and sent byte-identical
  const res = await fetchImpl(`${cfg.baseUrl}${path}`, { method: "POST", headers: authHeaders(cfg, path, body), body, signal: AbortSignal.timeout(20_000), cache: "no-store" });
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`iyzico ${path}: HTTP ${res.status}, non-JSON response`);
  }
}

export type InitRequest = {
  locale: "tr" | "en";
  conversationId: string;
  price: string;
  paidPrice: string;
  currency: string;
  basketId: string;
  paymentGroup: "PRODUCT";
  callbackUrl: string;
  enabledInstallments: number[];
  buyer: { id: string; name: string; surname: string; gsmNumber: string; email: string; identityNumber: string; registrationAddress: string; ip?: string; city: string; country: string };
  shippingAddress: { contactName: string; city: string; country: string; address: string };
  billingAddress: { contactName: string; city: string; country: string; address: string };
  basketItems: { id: string; name: string; category1: string; itemType: "PHYSICAL"; price: string }[];
};
export type InitResponse = { status?: string; errorCode?: string; errorMessage?: string; token?: string; paymentPageUrl?: string; conversationId?: string; signature?: string };

export const initializeCheckoutForm = (cfg: IyzicoConfig, req: InitRequest, fetchImpl: Fetch = fetch) => call<InitResponse>(cfg, INIT_PATH, req, fetchImpl);
export const retrieveCheckoutForm = (cfg: IyzicoConfig, token: string, conversationId?: string, fetchImpl: Fetch = fetch) => call<RetrieveResult>(cfg, RETRIEVE_PATH, { locale: "en", token, ...(conversationId ? { conversationId } : {}) }, fetchImpl);

/** Only iyzico's own hosted pages are followed (defence against a tampered response). */
export function safePaymentPageUrl(u: string | undefined): string | null {
  try {
    const url = new URL(u ?? "");
    return url.protocol === "https:" && (url.hostname === "iyzico.com" || url.hostname.endsWith(".iyzico.com") || url.hostname.endsWith(".iyzipay.com")) ? url.toString() : null;
  } catch {
    return null;
  }
}
