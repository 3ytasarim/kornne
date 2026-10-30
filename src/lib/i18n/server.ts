import "server-only";
import { notFound } from "next/navigation";
import { getDictionary, format } from "./dictionaries";
import { isEnabledLocale, LOCALE_META, type Locale } from "./config";
import { localizePath } from "./routes";

/** Resolves the [locale] route param (404 for unknown) and returns helpers for server components. */
export function getI18n(param: string) {
  if (!isEnabledLocale(param)) notFound();
  const locale: Locale = param;
  const d = getDictionary(locale);
  return {
    locale,
    d,
    /** internal (Turkish) path → visible localized path */
    href: (internalPath: string) => localizePath(locale, internalPath),
    t: format,
    languageName: (l: Locale) => LOCALE_META[l].nativeName,
  };
}
