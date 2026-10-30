import { ENABLED_LOCALES, type Locale } from "./config";
import { localizePath } from "./routes";

export type Alternates = Partial<Record<Locale, string>>;

/** Static page available in every enabled locale under the same internal path. */
export function staticAlternates(internalPath: string): Alternates {
  return Object.fromEntries(ENABLED_LOCALES.map((l) => [l, localizePath(l, internalPath)]));
}

/**
 * Entity with per-locale slugs (product, category, page). Only locales that really have a translation are
 * emitted — hreflang must never point to a page that does not exist. Fewer than two → no hreflang.
 */
export function entityAlternates(prefix: string, slugs: Alternates): Alternates | undefined {
  const present = ENABLED_LOCALES.filter((l) => slugs[l]);
  if (present.length < 2) return undefined;
  return Object.fromEntries(present.map((l) => [l, localizePath(l, `${prefix}/${slugs[l]}`)]));
}
