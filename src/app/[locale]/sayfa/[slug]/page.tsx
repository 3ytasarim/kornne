import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/catalog/Breadcrumbs";
import { PageLanguageLinks } from "@/components/layout/PageLanguageLinks";
import { JsonLd } from "@/components/seo/JsonLd";
import { Notice } from "@/components/ui/States";
import { CMS_PAGES } from "@/lib/content/pages";
import { getPublishedPage, listPublishedPaths } from "@/lib/cms/store";
import { entityAlternates } from "@/lib/i18n/alternates";
import { ENABLED_LOCALES, LOCALE_META, type Locale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/routes";
import { getI18n } from "@/lib/i18n/server";
import { breadcrumbJsonLd } from "@/lib/seo/json-ld";
import { buildMetadata, toMetaDescription } from "@/lib/seo/metadata";

export const revalidate = 300;
const LEGACY_KEYS = new Set(Object.keys(CMS_PAGES));
const textOf = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

/**
 * CMS pages (Sprint 7): served from the PUBLISHED revision in Neon (Admin › İçerik). A language without its own text
 * shows the Turkish text with a visible notice and is never indexed; unapproved legal texts are never indexed.
 */
export async function generateStaticParams() {
  return (await listPublishedPaths("page")).filter((p) => ENABLED_LOCALES.includes(p.locale)).map((p) => ({ locale: p.locale, slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps<"/[locale]/sayfa/[slug]">) {
  const { locale: lp, slug } = await params;
  const { locale, d } = getI18n(lp);
  const page = await getPublishedPage(locale, "page", decodeURIComponent(slug));
  if (!page) return {};
  return buildMetadata({
    title: page.seoTitle || page.title,
    description: page.seoDescription || toMetaDescription(textOf(page.bodyHtml), d.meta.defaultDescription),
    path: `/sayfa/${page.slug}`,
    locale,
    alternates: page.kind === "LEGAL" || page.contentStatus === "fallback" ? false : (entityAlternates("/sayfa", page.ownSlugs) ?? false),
    noindex: page.contentStatus === "fallback" || (page.kind === "LEGAL" && !page.legalApproved),
  });
}

export default async function CmsPageRoute({ params }: PageProps<"/[locale]/sayfa/[slug]">) {
  const { locale: lp, slug } = await params;
  const { locale, d, href, t } = getI18n(lp);
  const page = await getPublishedPage(locale, "page", decodeURIComponent(slug));
  if (!page) notFound();
  const path = href(`/sayfa/${page.slug}`);
  const crumbs = [
    { name: d.nav.home, path: href("/") },
    { name: page.title, path },
  ];
  const langLinks = Object.fromEntries(Object.entries(page.slugs).map(([l, s]) => [l, localizePath(l as Locale, `/sayfa/${s}`)]));
  const fallback = page.contentStatus === "fallback";

  return (
    <div className="container-site max-w-4xl py-8 md:py-12">
      <PageLanguageLinks links={langLinks} />
      <JsonLd data={breadcrumbJsonLd(crumbs)} />
      <Breadcrumbs items={crumbs} label={d.a11y.breadcrumb} />
      <h1 className="mt-6 font-display text-h1 font-bold text-ink">{page.title}</h1>
      <div className="mt-6 space-y-3">
        {fallback ? <Notice tone="warning">{t(d.product.translationMissing, { language: LOCALE_META[locale].nativeName })}</Notice> : null}
        {page.kind === "LEGAL" && !page.legalApproved ? <Notice tone="warning">{d.cms.legalPending}</Notice> : null}
        {LEGACY_KEYS.has(page.key) && !page.legalApproved ? <Notice>{d.corporate.sourceNotice}</Notice> : null}
      </div>
      <div lang={fallback ? "tr" : undefined} dir={fallback ? "ltr" : undefined} className="rich mt-8" dangerouslySetInnerHTML={{ __html: page.bodyHtml }} />
    </div>
  );
}
