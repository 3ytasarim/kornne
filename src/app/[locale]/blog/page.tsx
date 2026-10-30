import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/catalog/Breadcrumbs";
import { listBlogPosts } from "@/lib/cms/store";
import { ENABLED_LOCALES, LOCALE_META } from "@/lib/i18n/config";
import { getI18n } from "@/lib/i18n/server";
import { buildMetadata } from "@/lib/seo/metadata";

export const revalidate = 300;

export function generateStaticParams() {
  return ENABLED_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: PageProps<"/[locale]/blog">) {
  const { locale, d } = getI18n((await params).locale);
  const posts = await listBlogPosts(locale);
  return buildMetadata({ title: d.cms.blogTitle, description: d.cms.blogLead, path: "/blog", locale, noindex: posts.length === 0 });
}

/** Blog list — only posts published in THIS language. No posts → 404 (the menu link is hidden too). */
export default async function BlogIndex({ params }: PageProps<"/[locale]/blog">) {
  const { locale, d, href, t } = getI18n((await params).locale);
  const posts = await listBlogPosts(locale);
  if (!posts.length) notFound();
  const date = new Intl.DateTimeFormat(LOCALE_META[locale].intl, { dateStyle: "long", timeZone: "Europe/Istanbul" });
  return (
    <div className="container-site max-w-5xl py-8 md:py-12">
      <Breadcrumbs items={[{ name: d.nav.home, path: href("/") }, { name: d.cms.blogTitle, path: href("/blog") }]} label={d.a11y.breadcrumb} />
      <h1 className="mt-6 font-display text-h1 font-bold text-ink">{d.cms.blogTitle}</h1>
      <p className="mt-2 text-lg text-steel">{d.cms.blogLead}</p>
      <ul className="mt-10 grid gap-6 md:grid-cols-2">
        {posts.map((p) => (
          <li key={p.pageId}>
            <article className="flex h-full flex-col rounded-[var(--radius-lg)] border border-line bg-surface p-6">
              {p.publishedAt ? <p className="text-xs text-steel">{t(d.cms.publishedOn, { date: date.format(p.publishedAt) })}</p> : null}
              <h2 className="mt-2 text-xl font-bold text-ink">
                <Link href={href(`/blog/${p.slug}`)} className="hover:text-brand-700">
                  {p.title}
                </Link>
              </h2>
              {p.excerpt ? <p className="mt-2 flex-1 text-steel">{p.excerpt}</p> : <span className="flex-1" />}
              <Link href={href(`/blog/${p.slug}`)} className="mt-4 inline-flex min-h-11 items-center font-semibold text-brand-700 hover:underline dark:text-brand-300" aria-label={`${d.cms.readMore}: ${p.title}`}>
                {d.cms.readMore} →
              </Link>
            </article>
          </li>
        ))}
      </ul>
    </div>
  );
}
