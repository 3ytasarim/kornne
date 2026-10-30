"use client";

import { useSyncExternalStore } from "react";

/**
 * Quote list (multi-product request basket) kept in localStorage — product references and quantities ONLY:
 * no personal data, no price (prices are unverified and are never stored or summed client-side).
 * The server re-validates every item against the database when the request is submitted.
 */
export type QuoteLine = {
  /** public legacy product number (Product.sourceKey "kornne.com:<id>") */
  productRef: string;
  variantId: string | null;
  variantLabel: string | null;
  quantity: number;
  /** display cache only — the server snapshots the authoritative title */
  title: string;
  href: string;
  image: string | null;
};

export const QUOTE_MAX_QTY = 999;
export const QUOTE_MAX_LINES = 50;
const KEY = "kornne-quote-list-v1";
const EVENT = "kornne-quote-list";
const EMPTY: QuoteLine[] = [];

export const clampQty = (n: number) => (Number.isFinite(n) ? Math.min(QUOTE_MAX_QTY, Math.max(1, Math.trunc(n))) : 1);
const lineKey = (l: Pick<QuoteLine, "productRef" | "variantId">) => `${l.productRef}|${l.variantId ?? ""}`;

let cache: { raw: string | null; value: QuoteLine[] } = { raw: null, value: EMPTY };

function read(): QuoteLine[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return EMPTY;
  }
  if (raw === cache.raw) return cache.value;
  let value: QuoteLine[] = EMPTY;
  try {
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (Array.isArray(parsed)) {
      value = parsed
        .filter((l): l is QuoteLine => !!l && typeof l === "object" && typeof (l as QuoteLine).productRef === "string" && /^\d{1,8}$/.test((l as QuoteLine).productRef))
        .slice(0, QUOTE_MAX_LINES)
        .map((l) => ({ ...l, quantity: clampQty(Number(l.quantity)), variantId: typeof l.variantId === "string" ? l.variantId : null }));
    }
  } catch {
    value = EMPTY;
  }
  cache = { raw, value };
  return value;
}

function write(lines: QuoteLine[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(lines.slice(0, QUOTE_MAX_LINES)));
  } catch {
    /* storage blocked (private mode) — the list simply does not persist */
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => e.key === KEY && cb();
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useQuoteList(): QuoteLine[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export const quoteList = {
  add(line: Omit<QuoteLine, "quantity"> & { quantity?: number }) {
    const lines = [...read()];
    const i = lines.findIndex((l) => lineKey(l) === lineKey(line));
    if (i >= 0) lines[i] = { ...lines[i]!, quantity: clampQty(lines[i]!.quantity + (line.quantity ?? 1)) };
    else if (lines.length < QUOTE_MAX_LINES) lines.push({ ...line, quantity: clampQty(line.quantity ?? 1) });
    write(lines);
  },
  setQuantity(ref: Pick<QuoteLine, "productRef" | "variantId">, quantity: number) {
    write(read().map((l) => (lineKey(l) === lineKey(ref) ? { ...l, quantity: clampQty(quantity) } : l)));
  },
  remove(ref: Pick<QuoteLine, "productRef" | "variantId">) {
    write(read().filter((l) => lineKey(l) !== lineKey(ref)));
  },
  clear() {
    write([]);
  },
};
