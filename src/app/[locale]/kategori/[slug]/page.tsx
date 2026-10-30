import { CategoryView, categoryMetadata } from "@/components/catalog/CategoryView";
import { catalog } from "@/lib/catalog";
import { ENABLED_LOCALES } from "@/lib/i18n/config";

export const revalidate = 300;

export async function generateStaticParams() {
  const out: { locale: string; slug: string }[] = [];
  for (const locale of ENABLED_LOCALES) for (const c of await catalog.listCategories(locale)) out.push({ locale, slug: c.slug });
  return out;
}

export async function generateMetadata({ params }: PageProps<"/[locale]/kategori/[slug]">) {
  const { locale, slug } = await params;
  return categoryMetadata(locale, decodeURIComponent(slug), 1);
}

export default async function CategoryPage({ params }: PageProps<"/[locale]/kategori/[slug]">) {
  const { locale, slug } = await params;
  return <CategoryView localeParam={locale} slug={decodeURIComponent(slug)} page={1} />;
}
