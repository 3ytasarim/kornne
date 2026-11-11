import type { MetadataRoute } from "next";
import { ENABLED_LOCALES } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/routes";
import { getSiteUrl, isIndexable } from "@/lib/seo/site";

/** Non-production → disallow everything. Production → allow public pages, keep admin/search/api out. */
export default function robots(): MetadataRoute.Robots {
  const site = getSiteUrl();
  if (!isIndexable()) return { rules: [{ userAgent: "*", disallow: "/" }] };
  return {
    // faceted / sorted listing variants are canonicalised to the base listing and kept out of the crawl budget
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api/", ...ENABLED_LOCALES.map((l) => localizePath(l, "/arama")), "/*?*siralama=", "/*?*kategori=", "/*?*q=", "/*?*sayfa="] }],
    sitemap: `${site}/sitemap.xml`,
    host: site,
  };
}
