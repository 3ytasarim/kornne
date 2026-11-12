/**
 * Merchant API (products_v1) — the CURRENT Google API. The Content API for Shopping is NOT used (sunset
 * 18 Aug 2026). Reference: https://developers.google.com/merchant/api/reference/rest/products_v1 (checked 2026-10).
 *
 *   POST https://merchantapi.googleapis.com/products/v1/accounts/{account}/productInputs:insert?dataSource=accounts/{account}/dataSources/{ds}
 *   DELETE https://merchantapi.googleapis.com/products/v1/accounts/{account}/productInputs/{productInput}?dataSource=…
 *   scope https://www.googleapis.com/auth/content
 * offerId + contentLanguage + feedLabel are REQUIRED and IMMUTABLE: changing one creates a different product.
 */
export type MerchantPrice = { amountMicros: string; currencyCode: string };
export type ProductAttributes = {
  title?: string;
  description?: string;
  link?: string;
  imageLink?: string;
  additionalImageLinks?: string[];
  availability?: "IN_STOCK" | "OUT_OF_STOCK" | "PREORDER" | "BACKORDER" | "LIMITED_AVAILABILITY";
  condition?: "NEW" | "USED" | "REFURBISHED";
  price?: MerchantPrice;
  salePrice?: MerchantPrice;
  shipping?: { country: string; price: MerchantPrice }[];
  brand?: string;
  gtins?: string[];
  mpn?: string;
  identifierExists?: boolean;
  googleProductCategory?: string;
  productTypes?: string[];
};
export type ProductInput = { offerId: string; contentLanguage: string; feedLabel: string; productAttributes: ProductAttributes; name?: string; product?: string };

export type MerchantTarget = { accountId: string; dataSourceId: string };

/** Adapter surface. Implementations: HttpMerchantClient (real, DISABLED by default) and MockMerchantClient (tests). */
export interface MerchantClient {
  readonly kind: "http" | "mock";
  insertProductInput(target: MerchantTarget, input: ProductInput, opts?: { idempotencyKey?: string }): Promise<ProductInput>;
  deleteProductInput(target: MerchantTarget, ref: { offerId: string; contentLanguage: string; feedLabel: string }): Promise<void>;
  /** read-only account discovery (planned use: verify the existing account / data sources before any write) */
  listDataSources(accountId: string): Promise<{ name: string; displayName?: string; input?: string }[]>;
}

/** google.rpc.Status-shaped error from the API, classified for retry decisions. */
export class MerchantApiError extends Error {
  constructor(
    message: string,
    public readonly httpStatus: number,
    public readonly googleStatus: string | null,
    public readonly retryable: boolean,
    public readonly retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = "MerchantApiError";
  }
}

export class MerchantDisabledError extends Error {
  constructor(public readonly reasons: string[]) {
    super(`Merchant API disabled: ${reasons.join("; ")}`);
    this.name = "MerchantDisabledError";
  }
}
