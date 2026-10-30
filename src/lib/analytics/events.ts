/**
 * Analytics event taxonomy (Sprint 10) — the ONLY events the site may send, with an allow-list of parameters.
 * Pure module (client + server + tests). docs/analytics/measurement-plan.md is the human version of this file.
 *
 * Hard rules:
 *  - no personal data: name, e-mail, phone, message, company, quote reference, session, token never leave the site;
 *    any string that LOOKS like an e-mail / phone number / quote reference is dropped, not "masked"
 *  - no commerce events while paid checkout is closed (purchase, begin_checkout, add_payment_info, …)
 *  - no price / value / currency: prices are not verified
 */
export type ItemParam = { item_id?: string; item_name?: string; item_category?: string; item_variant?: string; item_list_id?: string; index?: number; quantity?: number };
export type EventParams = Record<string, string | number | ItemParam[] | undefined>;

const ITEM_KEYS = new Set(["item_id", "item_name", "item_category", "item_variant", "item_list_id", "index", "quantity"]);

export const EVENTS = {
  page_view: ["page_location", "page_title", "language"],
  view_item: ["items"],
  view_item_list: ["item_list_id", "item_list_name", "items"],
  select_item: ["item_list_id", "item_list_name", "items"],
  search: ["search_term", "results_count"],
  /** custom: a product (variant, quantity) was put on the quote list */
  add_to_quote_list: ["items"],
  /** GA4 recommended lead event: a quote request was STORED (reference issued). Sent once per reference. */
  generate_lead: ["lead_source", "items_count"],
  /** custom: outbound WhatsApp link (location only, never the prefilled message) */
  whatsapp_click: ["link_location"],
  /** custom: tel: / mailto: link — the method only, never the number or address */
  contact_click: ["method", "link_location"],
} as const satisfies Record<string, readonly string[]>;
export type EventName = keyof typeof EVENTS;

/** Never sent while fiyatlı checkout is closed (and purchase data would be unverified anyway). */
export const FORBIDDEN_EVENTS = new Set(["purchase", "begin_checkout", "add_payment_info", "add_shipping_info", "add_to_cart", "remove_from_cart", "view_cart", "refund", "add_to_wishlist", "login", "sign_up"]);

const EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
const PHONE = /(?:\+?\d[\s().-]*){9,}/; // ≥ 9 digits in a row (with separators) — product refs are ≤ 7 digits
const QUOTE_REF = /\b(?:TKL|KRN|QR)[-_ ]?\d{3,}/i;
const URL_CREDENTIALS = /\/\/[^/\s:@]+:[^/\s@]+@/;

/** True when a value could identify a person (or carries a secret) — such values are never sent. */
export function looksPersonal(v: string): boolean {
  return EMAIL.test(v) || PHONE.test(v) || QUOTE_REF.test(v) || URL_CREDENTIALS.test(v);
}

const cleanString = (v: string, max = 100) => {
  const s = v.replace(/\s+/g, " ").trim().slice(0, max);
  return s && !looksPersonal(s) ? s : undefined;
};

/** Absolute URL → origin + path only (query strings can carry search terms / tokens; fragments too). */
export function cleanLocation(href: string): string | undefined {
  try {
    const u = new URL(href);
    const path = decodeURIComponent(u.pathname);
    return looksPersonal(path) ? `${u.origin}/` : `${u.origin}${u.pathname}`;
  } catch {
    return undefined;
  }
}

function cleanItems(items: unknown): ItemParam[] | undefined {
  if (!Array.isArray(items)) return undefined;
  const out: ItemParam[] = [];
  for (const raw of items.slice(0, 25)) {
    if (!raw || typeof raw !== "object") continue;
    const it: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (!ITEM_KEYS.has(k)) continue;
      if (typeof v === "number" && Number.isFinite(v)) it[k] = Math.trunc(v);
      else if (typeof v === "string") {
        const s = cleanString(v);
        if (s !== undefined) it[k] = s;
      }
    }
    if (Object.keys(it).length) out.push(it as ItemParam);
  }
  return out.length ? out : undefined;
}

/**
 * Validates an event against the taxonomy. Returns null for unknown / forbidden events; otherwise only allow-listed
 * parameters with PII-free values survive.
 */
export function sanitizeEvent(name: string, params: Record<string, unknown> = {}): { name: EventName; params: EventParams } | null {
  if (FORBIDDEN_EVENTS.has(name) || !(name in EVENTS)) return null;
  const allowed = EVENTS[name as EventName] as readonly string[];
  const out: EventParams = {};
  for (const key of allowed) {
    const v = params[key];
    if (v === undefined || v === null) continue;
    if (key === "items") {
      const items = cleanItems(v);
      if (items) out.items = items;
    } else if (key === "page_location") {
      const loc = typeof v === "string" ? cleanLocation(v) : undefined;
      if (loc) out.page_location = loc;
    } else if (typeof v === "number" && Number.isFinite(v)) out[key] = Math.trunc(v);
    else if (typeof v === "string") {
      const s = cleanString(v, key === "search_term" ? 60 : 100);
      if (s !== undefined) out[key] = s;
    }
  }
  return { name: name as EventName, params: out };
}
