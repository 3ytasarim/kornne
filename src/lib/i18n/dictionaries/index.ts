import type { Locale } from "../config";
import { tr, type Dictionary } from "./tr";
import type { DeepPartial } from "./types";
import { en } from "./en";
import { fr } from "./fr";
import { ru } from "./ru";
import { ar } from "./ar";
import { de } from "./de";

export type { Dictionary, DeepPartial };

export const PARTIALS: Record<Exclude<Locale, "tr">, DeepPartial<Dictionary>> = { en, de, fr, ru, ar };

function merge<T>(base: T, over: DeepPartial<T> | undefined): T {
  if (over === undefined || over === null) return base;
  if (typeof base !== "object" || base === null || Array.isArray(base)) return over as T;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over as Record<string, unknown>)) {
    if (v === undefined) continue;
    out[k] = merge((base as Record<string, unknown>)[k], v as DeepPartial<unknown>);
  }
  return out as T;
}

/** Turkish (source) → English → locale: a missing key falls back to the previous language. */
export function getDictionary(locale: Locale): Dictionary {
  if (locale === "tr") return tr;
  const withEn = merge<Dictionary>(tr, en);
  return locale === "en" ? withEn : merge<Dictionary>(withEn, PARTIALS[locale]);
}

/** Dot-paths of keys a locale does not translate itself (falls back). Used by i18n:check and the admin dashboard. */
export function missingKeys(locale: Exclude<Locale, "tr">): string[] {
  const out: string[] = [];
  const walk = (base: unknown, over: unknown, path: string) => {
    if (typeof base === "string") {
      if (typeof over !== "string" || over.length === 0) out.push(path);
      return;
    }
    if (Array.isArray(base)) {
      base.forEach((b, i) => walk(b, Array.isArray(over) ? over[i] : undefined, `${path}[${i}]`));
      return;
    }
    if (base && typeof base === "object") {
      for (const k of Object.keys(base)) walk((base as Record<string, unknown>)[k], over && typeof over === "object" ? (over as Record<string, unknown>)[k] : undefined, path ? `${path}.${k}` : k);
    }
  };
  walk(tr, PARTIALS[locale], "");
  return out;
}

/** Fills "{name}" placeholders (lives in ../format so client components can use it without the dictionaries). */
export { format } from "../format";
