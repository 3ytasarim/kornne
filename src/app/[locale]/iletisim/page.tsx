import { Mail, MapPin, Phone } from "lucide-react";
import { Breadcrumbs } from "@/components/catalog/Breadcrumbs";
import { PageLanguageLinks } from "@/components/layout/PageLanguageLinks";
import { whatsappHref, WhatsAppIcon } from "@/components/layout/WhatsAppCta";
import { JsonLd } from "@/components/seo/JsonLd";
import { ButtonAnchor } from "@/components/ui/Button";
import { SITE } from "@/config/site";
import { staticAlternates } from "@/lib/i18n/alternates";
import { getI18n } from "@/lib/i18n/server";
import { breadcrumbJsonLd } from "@/lib/seo/json-ld";
import { getContact } from "@/lib/cms/store";
import { buildMetadata } from "@/lib/seo/metadata";

export async function generateMetadata({ params }: PageProps<"/[locale]/iletisim">) {
  const { locale, d } = getI18n((await params).locale);
  return buildMetadata({ title: d.contact.title, description: d.contact.lead, path: "/iletisim", locale, noindex: true });
}

export default async function ContactPage({ params }: PageProps<"/[locale]/iletisim">) {
  const { d, href, t } = getI18n((await params).locale);
  const contact = await getContact();
  const crumbs = [
    { name: d.nav.home, path: href("/") },
    { name: d.contact.title, path: href("/iletisim") },
  ];
  const mapQuery = encodeURIComponent(contact.address);
  const channel = "flex items-start gap-4 rounded-[var(--radius-lg)] border border-line p-5 transition-colors hover:border-brand-600";

  return (
    <div className="container-site py-8 md:py-12" data-analytics-location="contact">
      <PageLanguageLinks links={staticAlternates("/iletisim")} />
      <JsonLd data={breadcrumbJsonLd(crumbs)} />
      <Breadcrumbs items={crumbs} label={d.a11y.breadcrumb} />
      <header className="mt-6 mb-10 max-w-2xl">
        <h1 className="font-display text-h1 font-bold text-ink">{d.contact.title}</h1>
        <p className="mt-3 text-lg text-steel">{d.contact.lead}</p>
      </header>

      <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr]">
        <ul className="grid content-start gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <li>
            <a href={`tel:${contact.phoneE164}`} className={channel}>
              <Phone aria-hidden="true" className="mt-1 size-5 shrink-0 text-brand-600" />
              <span>
                <span className="block text-sm text-steel">{d.contact.phone}</span>
                <span className="font-semibold text-ink" dir="ltr">
                  {contact.phoneDisplay}
                </span>
              </span>
            </a>
          </li>
          <li>
            <a href={whatsappHref(t(d.product.whatsappMessage, { url: SITE.name }), contact.whatsapp)} target="_blank" rel="noopener noreferrer" className={channel}>
              <WhatsAppIcon className="mt-1 size-5 shrink-0 text-whatsapp" />
              <span>
                <span className="block text-sm text-steel">{d.contact.whatsapp}</span>
                <span className="font-semibold text-ink" dir="ltr">
                  {contact.phoneDisplay}
                </span>
              </span>
            </a>
          </li>
          <li>
            <a href={`mailto:${contact.email}`} className={channel}>
              <Mail aria-hidden="true" className="mt-1 size-5 shrink-0 text-brand-600" />
              <span>
                <span className="block text-sm text-steel">{d.contact.email}</span>
                <span className="font-semibold text-ink">{contact.email}</span>
              </span>
            </a>
          </li>
          <li>
            <a href={`https://www.google.com/maps/search/?api=1&query=${mapQuery}`} target="_blank" rel="noopener noreferrer" className={channel}>
              <MapPin aria-hidden="true" className="mt-1 size-5 shrink-0 text-brand-600" />
              <span>
                <span className="block text-sm text-steel">{d.contact.address}</span>
                <span className="font-semibold text-ink">
                  {contact.address}
                </span>
                <span className="mt-1 block text-sm text-brand-600 underline">{d.contact.openMap}</span>
              </span>
            </a>
          </li>
        </ul>

        <section aria-labelledby="contact-form" className="rounded-[var(--radius-xl)] border border-line bg-surface-2 p-6 md:p-8">
          <h2 id="contact-form" className="text-h3 font-bold text-ink">
            {d.contact.formTitle}
          </h2>
          <p className="mt-2 text-ink-2">{d.contact.formNotice}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonAnchor href={whatsappHref(t(d.product.whatsappMessage, { url: SITE.name }), contact.whatsapp)} variant="whatsapp" icon={<WhatsAppIcon className="size-5" />}>
              {d.contact.whatsapp}
            </ButtonAnchor>
            <ButtonAnchor href={`mailto:${contact.email}`} variant="outline" icon={<Mail aria-hidden="true" className="size-4" />}>
              {d.contact.email}
            </ButtonAnchor>
          </div>
        </section>
      </div>
    </div>
  );
}
