import { getSiteUrl } from "./site";
import { SITE } from "@/config/site";
import { localizePath } from "@/lib/i18n/routes";
import type { Locale } from "@/lib/i18n/config";
import { toDecimalString } from "@/lib/money";

/**
 * JSON-LD builders. Organization/WebSite are emitted once per page (layout) with stable @id's that page-level
 * entities reference. Pattern adapted from Mezbaha-Teknolojileri src/lib/seo/json-ld.ts; Offer builder is new.
 *
 * Hard rules (docs/audit/merchant-readiness.md):
 *  - no AggregateRating / Review unless real, moderated reviews exist (legacy site faked 5/5 on every product)
 *  - Offer only for verified price data that matches the page, feed and cart exactly
 *  - no invented brand / gtin / mpn / sku
 */
export type Crumb = { name: string; path: string };

const orgId = () => `${getSiteUrl()}/#organization`;
const siteId = () => `${getSiteUrl()}/#website`;

/** Organization facts from Admin › Ayarlar (contact as published on kornne.com; legal name only once verified). */
export function organizationJsonLd(contact?: { phoneE164: string; email: string; address: string; social: { url: string }[]; legalName: string | null }) {
  const url = getSiteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": orgId(),
    name: SITE.name,
    url,
    logo: { "@type": "ImageObject", url: new URL(SITE.logo.src, url).toString(), width: SITE.logo.width, height: SITE.logo.height },
    ...(contact?.legalName ? { legalName: contact.legalName } : {}),
    email: contact?.email ?? SITE.email,
    telephone: contact?.phoneE164 ?? SITE.phoneE164,
    address: contact && contact.address !== `${SITE.address.street}, ${SITE.address.locality}/${SITE.address.region}` ? { "@type": "PostalAddress", streetAddress: contact.address, addressCountry: SITE.address.country } : { "@type": "PostalAddress", streetAddress: SITE.address.street, addressLocality: SITE.address.locality, addressRegion: SITE.address.region, addressCountry: SITE.address.country },
    sameAs: (contact?.social ?? SITE.social).map((s) => s.url),
  };
}

export function websiteJsonLd(locale: Locale) {
  const url = getSiteUrl();
  const home = localizePath(locale, "/");
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": siteId(),
    name: SITE.name,
    url: home === "/" ? url : `${url}${home}`,
    inLanguage: locale,
    publisher: { "@id": orgId() },
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${url}${localizePath(locale, "/arama")}?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}

export function breadcrumbJsonLd(items: Crumb[]) {
  const url = getSiteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: new URL(c.path, url).toString() })),
  };
}

/**
 * Category listing (Sprint 8): CollectionPage whose main entity is the ItemList of the products VISIBLE on this page
 * (URLs + names only — no price, offer or rating). Part of the WebSite graph via @id.
 */
export function collectionPageJsonLd(p: { name: string; description?: string | null; path: string; locale: Locale; items: { name: string; path: string }[] }) {
  const url = getSiteUrl();
  const pageUrl = new URL(p.path, url).toString();
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${pageUrl}#collection`,
    name: p.name,
    ...(p.description ? { description: p.description } : {}),
    url: pageUrl,
    inLanguage: p.locale,
    isPartOf: { "@id": siteId() },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: p.items.length,
      itemListElement: p.items.map((it, i) => ({ "@type": "ListItem", position: i + 1, url: new URL(it.path, url).toString(), name: it.name })),
    },
  };
}

export type ProductLdInput = {
  name: string;
  description: string;
  path: string;
  images: string[];
  locale: Locale;
  sku?: string | null;
  /** verified brand and real identifiers only */
  brand?: string | null;
  mpn?: string | null;
  gtin?: string | null;
  /** Only pass when the price is VERIFIED; otherwise the Product is emitted without offers. */
  offer?: {
    priceMinor: bigint;
    currency: string;
    availability: "InStock" | "OutOfStock" | "PreOrder" | "BackOrder";
    priceValidUntil?: string;
    /** flat freight the checkout charges in that country (OfferShippingDetails) */
    shipping?: { country: string; priceMinor: bigint; currency: string } | null;
    /** return policy (MerchantReturnPolicy): window in days, return freight paid by the customer */
    returns?: { country: string; days: number; customerPaysFreight: boolean } | null;
  } | null;
};

export function productJsonLd(p: ProductLdInput) {
  const url = getSiteUrl();
  const pageUrl = new URL(p.path, url).toString();
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${pageUrl}#product`,
    name: p.name,
    description: p.description,
    url: pageUrl,
    inLanguage: p.locale,
    image: p.images.map((i) => new URL(i, url).toString()),
    ...(p.sku ? { sku: p.sku } : {}),
    ...(p.brand ? { brand: { "@type": "Brand", name: p.brand } } : {}),
    ...(p.mpn ? { mpn: p.mpn } : {}),
    ...(p.gtin ? { gtin: p.gtin } : {}),
    ...(p.offer
      ? {
          offers: {
            "@type": "Offer",
            url: pageUrl,
            price: toDecimalString(p.offer.priceMinor),
            priceCurrency: p.offer.currency,
            availability: `https://schema.org/${p.offer.availability}`,
            itemCondition: "https://schema.org/NewCondition",
            seller: { "@id": orgId() },
            ...(p.offer.priceValidUntil ? { priceValidUntil: p.offer.priceValidUntil } : {}),
            ...(p.offer.shipping
              ? {
                  shippingDetails: {
                    "@type": "OfferShippingDetails",
                    shippingRate: { "@type": "MonetaryAmount", value: toDecimalString(p.offer.shipping.priceMinor), currency: p.offer.shipping.currency },
                    shippingDestination: { "@type": "DefinedRegion", addressCountry: p.offer.shipping.country },
                  },
                }
              : {}),
            ...(p.offer.returns
              ? {
                  hasMerchantReturnPolicy: {
                    "@type": "MerchantReturnPolicy",
                    applicableCountry: p.offer.returns.country,
                    returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
                    merchantReturnDays: p.offer.returns.days,
                    returnMethod: "https://schema.org/ReturnByMail",
                    returnFees: p.offer.returns.customerPaysFreight ? "https://schema.org/ReturnFeesCustomerResponsibility" : "https://schema.org/FreeReturn",
                  },
                }
              : {}),
          },
        }
      : {}),
  };
}

/** Safe serialization: prevents "</script>" breakouts and HTML comment injection inside JSON-LD. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}
