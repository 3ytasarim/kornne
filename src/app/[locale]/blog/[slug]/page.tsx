import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/catalog/Breadcrumbs";
import { PageLanguageLinks } from "@/components/layout/PageLanguageLinks";
import { JsonLd } from "@/components/seo/JsonLd";
import { getPublishedPage, listPublishedPaths } from "@/lib/cms/store";
import { entityAlternates } from "@/lib/i18n/alternates";
import { ENABLED_LOCALES, LOCALE_META, type Locale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/routes";
import { getI18n } from "@/lib/i18n/server";
import { breadcrumbJsonLd } from "@/lib/seo/json-ld";
import { buildMetadata, toMetaDescription } from "@/lib/seo/metadata";
import { getSiteUrl } from "@/lib/seo/site";

export const revalidate = 300;
const textOf = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

export async function generateStaticParams() {
  return (await listPublishedPaths("blog")).filter((p) => ENABLED_LOCALES.includes(p.locale)).map((p) => ({ locale: p.locale, slug: p.slug }));
}

async function load(lp: string, slug: string) {
  const i18n = getI18n(lp);
  const post = await getPublishedPage(i18n.locale, "blog", decodeURIComponent(slug));
  // blog posts are shown only in languages where they really exist (no Turkish fallback for articles)
  if (!post || post.contentStatus !== "own") return null;
  return { ...i18n, post };
}

export async function generateMetadata({ params }: PageProps<"/[locale]/blog/[slug]">) {
  const { locale: lp, slug } = await params;
  const r = await load(lp, slug);
  if (!r) return {};
  return buildMetadata({ title: r.post.seoTitle || r.post.title, description: r.post.seoDescription || r.post.excerpt || toMetaDescription(textOf(r.post.bodyHtml), r.d.meta.defaultDescription), path: `/blog/${r.post.slug}`, locale: r.locale, alternates: entityAlternates("/blog", r.post.ownSlugs) ?? false });
}

export default async function BlogPost({ params }: PageProps<"/[locale]/blog/[slug]">) {
  const { locale: lp, slug } = await params;
  const r = await load(lp, slug);
  if (!r) notFound();
  const { post, d, href, t, locale } = r;
  const path = href(`/blog/${post.slug}`);
  const crumbs = [
    { name: d.nav.home, path: href("/") },
    { name: d.cms.blogTitle, path: href("/blog") },
    { name: post.title, path },
  ];
  const date = post.publishedAt ? new Intl.DateTimeFormat(LOCALE_META[locale].intl, { dateStyle: "long", timeZone: "Europe/Istanbul" }).format(post.publishedAt) : null;
  // Article schema: only facts we have (no fake author / ratings); publisher = the organization
  const article = { "@context": "https://schema.org", "@type": "Article", headline: post.title, datePublished: post.publishedAt?.toISOString(), inLanguage: locale, mainEntityOfPage: `${getSiteUrl()}${path}`, publisher: { "@id": `${getSiteUrl()}/#organization` } };
  return (
    <article className="container-site max-w-3xl py-8 md:py-12">
      <PageLanguageLinks links={Object.fromEntries(Object.entries(post.ownSlugs).map(([l, s]) => [l, localizePath(l as Locale, `/blog/${s}`)]))} />
      <JsonLd data={breadcrumbJsonLd(crumbs)} />
      <JsonLd data={article} />
      <Breadcrumbs items={crumbs} label={d.a11y.breadcrumb} />
      <h1 className="mt-6 font-display text-h1 font-bold text-ink">{post.title}</h1>
      {date ? <p className="mt-2 text-sm text-steel">{t(d.cms.publishedOn, { date })}</p> : null}
      {post.excerpt ? <p className="mt-4 text-lg text-steel">{post.excerpt}</p> : null}
      <div className="rich mt-8" dangerouslySetInnerHTML={{ __html: post.bodyHtml }} />
      <Link href={href("/blog")} className="mt-10 inline-flex min-h-11 items-center font-semibold text-brand-700 hover:underline dark:text-brand-300">
        ← {d.cms.allPosts}
      </Link>
    </article>
  );
}
