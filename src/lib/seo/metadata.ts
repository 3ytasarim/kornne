import type { Metadata } from "next";
import { getSiteUrl, isIndexable, seoLocales } from "./site";
import { DEFAULT_LOCALE, LOCALE_META, type Locale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/routes";
import { staticAlternates, type Alternates } from "@/lib/i18n/alternates";
import { SITE } from "@/config/site";

/**
 * Page metadata: canonical, hreflang (+x-default), robots, Open Graph, Twitter.
 * Adapted from Mezbaha-Teknolojileri src/lib/seo/metadata.ts (own code). Differences: global indexing gate,
 * explicit `noindex` for unverified/untranslated content, KORNNE brand defaults.
 */
type Input = {
  title: string;
  description: string;
  /** INTERNAL (Turkish) path, e.g. "/urun/x" — localized here */
  path: string;
  locale: Locale;
  /** Visible paths per locale; undefined → same internal path in every locale; false → no hreflang */
  alternates?: Alternates | false;
  /** Pre-localized public path (entity pages whose slug differs per locale) */
  publicPath?: string;
  image?: { url: string; width?: number | null; height?: number | null; alt?: string };
  noindex?: boolean;
  type?: "website" | "article";
};

export function buildMetadata({ title, description: rawDescription, path, locale, alternates: altInput, publicPath, image, noindex, type = "website" }: Input): Metadata {
  const siteUrl = getSiteUrl();
  const description = clampDescription(rawDescription);
  const abs = (p: string) => new URL(p, siteUrl).toString();
  const url = abs(publicPath ?? localizePath(locale, path));
  // hreflang only between indexable language versions (SEO_LOCALES ∩ really translated); fewer than two → none
  const seo = seoLocales();
  const filtered = altInput === false ? undefined : Object.fromEntries(Object.entries(altInput ?? staticAlternates(path)).filter(([l]) => seo.includes(l as Locale)));
  const alternates = filtered && Object.keys(filtered).length >= 2 ? (filtered as Alternates) : undefined;
  const languages = alternates
    ? {
        ...Object.fromEntries(Object.entries(alternates).map(([l, p]) => [l, abs(p as string)])),
        ...(alternates[DEFAULT_LOCALE] ? { "x-default": abs(alternates[DEFAULT_LOCALE]!) } : {}),
      }
    : undefined;
  const index = isIndexable() && !noindex && seo.includes(locale);
  const ogImage = image ?? { url: SITE.logo.src, width: SITE.logo.width, height: SITE.logo.height, alt: SITE.name };

  return {
    title,
    description,
    alternates: { canonical: url, ...(languages ? { languages } : {}) },
    robots: index
      ? { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 }
      : { index: false, follow: false },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE.name,
      type,
      locale: LOCALE_META[locale].ogLocale,
      images: [{ url: abs(ogImage.url), ...(ogImage.width ? { width: ogImage.width } : {}), ...(ogImage.height ? { height: ogImage.height } : {}), alt: ogImage.alt ?? title }],
    },
    twitter: { card: "summary_large_image", title, description, images: [abs(ogImage.url)] },
  };
}

/** Search snippets are cut at ≈160 characters: keep every meta description within that, at a word boundary. */
export function clampDescription(text: string, max = 160): string {
  const clean = text.replace(/s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).replace(/s+S*$/, "")}…`;
}

/** Plain-text meta description from rich text (≤ 160 chars, word boundary). */
export function toMetaDescription(text: string, fallback: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length < 50) return fallback;
  if (clean.length <= 160) return clean;
  return `${clean.slice(0, 157).replace(/\s+\S*$/, "")}…`;
}
