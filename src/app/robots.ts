import type { MetadataRoute } from "next";
import { getSiteUrl, isIndexable } from "@/lib/seo/site";

/** Non-production → disallow everything. Production → allow public pages, keep admin/search/api out. */
export default function robots(): MetadataRoute.Robots {
  const site = getSiteUrl();
  if (!isIndexable()) return { rules: [{ userAgent: "*", disallow: "/" }] };
  return {
    // faceted / sorted listing variants are canonicalised to the base listing and kept out of the crawl budget
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/arama", "/en/search", "/fr/recherche", "/ru/poisk", "/ar/search", "/*?*siralama=", "/*?*kategori=", "/*?*q=", "/*?*sayfa="] }],
    sitemap: `${site}/sitemap.xml`,
    host: site,
  };
}
