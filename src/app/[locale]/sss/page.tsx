import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/catalog/Breadcrumbs";
import { JsonLd } from "@/components/seo/JsonLd";
import { getFaq } from "@/lib/cms/store";
import { ENABLED_LOCALES } from "@/lib/i18n/config";
import { getI18n } from "@/lib/i18n/server";
import { breadcrumbJsonLd } from "@/lib/seo/json-ld";
import { buildMetadata } from "@/lib/seo/metadata";

export const revalidate = 300;
const textOf = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

export function generateStaticParams() {
  return ENABLED_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: PageProps<"/[locale]/sss">) {
  const { locale, d } = getI18n((await params).locale);
  const items = await getFaq(locale);
  return buildMetadata({ title: d.cms.faqTitle, description: d.cms.faqLead, path: "/sss", locale, noindex: items.length === 0 });
}

/** Site FAQ — only published, sourced answers in this language. Empty → 404 (no empty page, no menu link). */
export default async function FaqPage({ params }: PageProps<"/[locale]/sss">) {
  const { locale, d, href } = getI18n((await params).locale);
  const items = await getFaq(locale);
  if (!items.length) notFound();
  const crumbs = [
    { name: d.nav.home, path: href("/") },
    { name: d.cms.faqTitle, path: href("/sss") },
  ];
  // FAQPage structured data from exactly the visible, published Q&A (AI answer engines / GEO)
  const faqLd = { "@context": "https://schema.org", "@type": "FAQPage", inLanguage: locale, mainEntity: items.map((i) => ({ "@type": "Question", name: i.question, acceptedAnswer: { "@type": "Answer", text: textOf(i.answerHtml) } })) };
  return (
    <div className="container-site max-w-3xl py-8 md:py-12">
      <JsonLd data={breadcrumbJsonLd(crumbs)} />
      <JsonLd data={faqLd} />
      <Breadcrumbs items={crumbs} label={d.a11y.breadcrumb} />
      <h1 className="mt-6 font-display text-h1 font-bold text-ink">{d.cms.faqTitle}</h1>
      <p className="mt-2 text-lg text-steel">{d.cms.faqLead}</p>
      <div className="mt-8 divide-y divide-line rounded-[var(--radius-lg)] border border-line bg-surface">
        {items.map((i) => (
          <details key={i.id} className="group p-5">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold text-ink">
              {i.question}
              <span aria-hidden="true" className="text-brand-700 transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <div className="rich mt-3" dangerouslySetInnerHTML={{ __html: i.answerHtml }} />
          </details>
        ))}
      </div>
    </div>
  );
}
