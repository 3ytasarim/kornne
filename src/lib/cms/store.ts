import "server-only";
import type { BannerPlacement, Locale, MenuLocation, PageKind } from "@prisma/client";
import { SITE } from "@/config/site";
import { sanitizeRichText } from "@/lib/catalog/sanitize";
import { prisma } from "@/lib/db";
import { localizePath } from "@/lib/i18n/routes";
import { SETTING_DEFS, type SettingKey } from "./settings";

/**
 * Storefront view of the CMS. Reads ONLY published revisions, active menu items, banners inside their window and
 * published FAQ entries. One batch of queries, memoised per process (TTL) — pages are ISR, admin writes call
 * invalidateContent() + revalidatePath. Shared via globalThis so every bundle in the process sees the same memo.
 */
const TTL_MS = 60_000;

async function query() {
  const db = prisma;
  if (!db) throw new Error("DATABASE_URL is not configured");
  const [pages, menus, banners, faq, settings] = await Promise.all([
    db.pageTranslation.findMany({
      where: { state: "PUBLISHED", publishedRevisionId: { not: null }, page: { status: { not: "ARCHIVED" } } },
      select: { locale: true, publishedSlug: true, publishedAt: true, page: { select: { id: true, key: true, kind: true, legalApprovedAt: true } }, publishedRevision: { select: { title: true, excerpt: true, bodyHtml: true, seoTitle: true, seoDescription: true, createdAt: true } } },
    }),
    db.menuItem.findMany({ where: { active: true }, orderBy: [{ location: "asc" }, { sortOrder: "asc" }] }),
    db.banner.findMany({ where: { state: "PUBLISHED" }, include: { translations: true, media: { select: { publicPath: true, width: true, height: true } } }, orderBy: { sortOrder: "asc" } }),
    db.faqItem.findMany({ where: { state: "PUBLISHED" }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, locale: true, question: true, answerHtml: true, productId: true } }),
    db.siteSetting.findMany(),
  ]);
  return { pages, menus, banners, faq, settings };
}
type Raw = Awaited<ReturnType<typeof query>>;
const g = globalThis as unknown as { __kornneContent?: { at: number; data: Promise<Raw> } | null };

function load(): Promise<Raw> {
  if (!g.__kornneContent || Date.now() - g.__kornneContent.at > TTL_MS) {
    const data = query();
    g.__kornneContent = { at: Date.now(), data };
    data.catch(() => (g.__kornneContent = null));
  }
  return g.__kornneContent.data;
}

export function invalidateContent() {
  g.__kornneContent = null;
}

export type PublishedPage = {
  pageId: string;
  key: string;
  kind: PageKind;
  locale: Locale;
  slug: string;
  title: string;
  excerpt: string | null;
  bodyHtml: string;
  seoTitle: string | null;
  seoDescription: string | null;
  publishedAt: Date | null;
  legalApproved: boolean;
  /** "own" = text in this language; "fallback" = this language has no text → Turkish body shown with a notice */
  contentStatus: "own" | "fallback";
  /** published slug per language (language switcher) */
  slugs: Partial<Record<Locale, string>>;
  /** languages with their OWN text only (hreflang) */
  ownSlugs: Partial<Record<Locale, string>>;
};

const sectionOf = (kind: PageKind) => (kind === "BLOG" ? "blog" : "page");

function toPage(raw: Raw, row: Raw["pages"][number]): PublishedPage {
  const rev = row.publishedRevision!;
  const siblings = raw.pages.filter((p) => p.page.id === row.page.id);
  const tr = siblings.find((p) => p.locale === "tr");
  const own = rev.bodyHtml.trim().length > 0;
  return {
    pageId: row.page.id,
    key: row.page.key,
    kind: row.page.kind,
    locale: row.locale,
    slug: row.publishedSlug!,
    title: rev.title,
    excerpt: rev.excerpt,
    // stored sanitized at save time; sanitized again here (defence in depth against direct DB writes)
    bodyHtml: sanitizeRichText(own ? rev.bodyHtml : (tr?.publishedRevision?.bodyHtml ?? "")),
    seoTitle: rev.seoTitle,
    seoDescription: rev.seoDescription,
    publishedAt: row.publishedAt,
    legalApproved: !!row.page.legalApprovedAt,
    contentStatus: own || row.locale === "tr" ? "own" : "fallback",
    slugs: Object.fromEntries(siblings.map((s) => [s.locale, s.publishedSlug!])),
    ownSlugs: Object.fromEntries(siblings.filter((s) => s.publishedRevision?.bodyHtml.trim()).map((s) => [s.locale, s.publishedSlug!])),
  };
}

export async function getPublishedPage(locale: Locale, section: "page" | "blog", slug: string): Promise<PublishedPage | null> {
  const raw = await load();
  const row = raw.pages.find((p) => p.locale === locale && p.publishedSlug === slug && sectionOf(p.page.kind) === section);
  if (!row) return null;
  const page = toPage(raw, row);
  return page.bodyHtml ? page : null;
}

export async function listPublishedPaths(section: "page" | "blog"): Promise<{ locale: Locale; slug: string }[]> {
  const raw = await load();
  return raw.pages.filter((p) => sectionOf(p.page.kind) === section).map((p) => ({ locale: p.locale, slug: p.publishedSlug! }));
}

export async function listBlogPosts(locale: Locale): Promise<PublishedPage[]> {
  const raw = await load();
  return raw.pages
    .filter((p) => p.page.kind === "BLOG" && p.locale === locale)
    .map((p) => toPage(raw, p))
    .filter((p) => p.contentStatus === "own")
    .sort((a, b) => +(b.publishedAt ?? 0) - +(a.publishedAt ?? 0));
}

export async function getFaq(locale: Locale, productId: string | null = null) {
  const raw = await load();
  return raw.faq.filter((f) => f.locale === locale && f.productId === productId).map((f) => ({ ...f, answerHtml: sanitizeRichText(f.answerHtml) }));
}

export async function getActiveBanners(locale: Locale, placement: BannerPlacement, now = new Date()) {
  const raw = await load();
  return raw.banners
    .filter((b) => b.placement === placement && (!b.startsAt || b.startsAt <= now) && !!b.endsAt && b.endsAt > now)
    .map((b) => {
      const t = b.translations.find((x) => x.locale === locale);
      return t ? { id: b.id, title: t.title, text: t.text, ctaLabel: t.ctaLabel, href: b.linkPath ? (b.linkPath.startsWith("/") ? localizePath(locale, b.linkPath) : b.linkPath) : null, external: !!b.linkPath && !b.linkPath.startsWith("/"), image: b.media } : null;
    })
    .filter((b): b is NonNullable<typeof b> => b !== null);
}

export type MenuLink = { label: string; href: string; hrefLang?: string; external?: boolean };

/**
 * Resolves a menu for a language. A page link appears only if the page is published in that language — or, for
 * Turkish-only legal texts, links to the Turkish page (hrefLang="tr"). Blog / FAQ links appear only when content
 * exists. Category links resolve to the category's slug in that language.
 */
export async function getMenu(locale: Locale, location: MenuLocation, categorySlugs: Record<string, string>): Promise<MenuLink[]> {
  const raw = await load();
  const out: MenuLink[] = [];
  for (const m of raw.menus.filter((x) => x.location === location)) {
    const labels = m.labels as Partial<Record<Locale, string>>;
    const label = labels[locale] || labels.tr;
    if (!label) continue;
    if (m.kind === "page") {
      const rows = raw.pages.filter((p) => p.page.key === m.pageKey);
      const own = rows.find((p) => p.locale === locale);
      const tr = rows.find((p) => p.locale === "tr");
      const target = own ?? tr;
      if (!target) continue;
      out.push({ label, href: localizePath(target.locale, `/${sectionOf(target.page.kind) === "blog" ? "blog" : "sayfa"}/${target.publishedSlug}`), hrefLang: own ? undefined : "tr" });
    } else if (m.kind === "category") {
      const slug = categorySlugs[m.categoryKey ?? ""];
      if (slug) out.push({ label, href: localizePath(locale, `/kategori/${slug}`) });
    } else if (m.path) {
      if (m.path.startsWith("/")) {
        if (m.path === "/blog" && !raw.pages.some((p) => p.page.kind === "BLOG" && p.locale === locale)) continue;
        if (m.path === "/sss" && !raw.faq.some((f) => f.locale === locale && !f.productId)) continue;
        out.push({ label, href: localizePath(locale, m.path) });
      } else out.push({ label, href: m.path, external: true });
    }
  }
  return out;
}

export async function hasMenus(): Promise<boolean> {
  return (await load()).menus.length > 0;
}

/** Public value of a setting (respecting publicWhen); falls back to the captured kornne.com value. */
export async function getPublicSetting(key: SettingKey): Promise<string | null> {
  const raw = await load();
  const def = SETTING_DEFS[key];
  const row = raw.settings.find((s) => s.key === key);
  if (def.publicWhen === "never") return null;
  if (row && (def.publicWhen === "always" || row.status === "VERIFIED")) return String(row.value ?? "") || null;
  if (def.publicWhen === "verified") return null;
  return ("seed" in def ? def.seed : null) ?? null;
}

/** Contact block used by header / footer / contact page / JSON-LD (single source: Admin › Ayarlar). */
export async function getContact() {
  const [phoneDisplay, phoneE164, email, whatsapp, address, instagram, facebook, youtube, legalName] = await Promise.all(
    (["contact.phoneDisplay", "contact.phoneE164", "contact.email", "contact.whatsapp", "contact.address", "social.instagram", "social.facebook", "social.youtube", "company.legalName"] as const).map((k) => getPublicSetting(k).catch(() => null)),
  );
  return {
    phoneDisplay: phoneDisplay ?? SITE.phoneDisplay,
    phoneE164: phoneE164 ?? SITE.phoneE164,
    email: email ?? SITE.email,
    whatsapp: whatsapp ?? SITE.whatsappE164,
    address: address ?? `${SITE.address.street}, ${SITE.address.locality}/${SITE.address.region}`,
    social: [
      { name: "Instagram", url: instagram },
      { name: "Facebook", url: facebook },
      { name: "YouTube", url: youtube },
    ].filter((s): s is { name: string; url: string } => !!s.url),
    /** null until verified */
    legalName: legalName ?? null,
  };
}
