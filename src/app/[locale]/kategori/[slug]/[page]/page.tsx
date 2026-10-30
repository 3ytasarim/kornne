import { notFound } from "next/navigation";
import { CategoryView, categoryMetadata } from "@/components/catalog/CategoryView";
import { catalog } from "@/lib/catalog";
import { paginate } from "@/lib/catalog/pagination";
import { ENABLED_LOCALES } from "@/lib/i18n/config";

export const revalidate = 300;

export async function generateStaticParams() {
  const out: { locale: string; slug: string; page: string }[] = [];
  for (const locale of ENABLED_LOCALES)
    for (const c of await catalog.listCategories(locale)) {
      const data = await catalog.getCategory(locale, c.slug);
      const { pages } = paginate(data?.products ?? [], 1);
      for (let n = 2; n <= pages; n++) out.push({ locale, slug: c.slug, page: String(n) });
    }
  return out;
}

/** Legacy-compatible pagination URL: /kategori/<slug>/<n> (n ≥ 2; "/1" is 301'd to the base URL by the proxy). */
function parsePage(raw: string): number | null {
  if (!/^[2-9]\d{0,2}$/.test(raw)) return null;
  return Number(raw);
}

export async function generateMetadata({ params }: PageProps<"/[locale]/kategori/[slug]/[page]">) {
  const { locale, slug, page } = await params;
  const n = parsePage(page);
  return n ? categoryMetadata(locale, decodeURIComponent(slug), n) : {};
}

export default async function CategoryPagedPage({ params }: PageProps<"/[locale]/kategori/[slug]/[page]">) {
  const { locale, slug, page } = await params;
  const n = parsePage(page);
  if (!n) notFound();
  return <CategoryView localeParam={locale} slug={decodeURIComponent(slug)} page={n} />;
}
