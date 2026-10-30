import type { Alternates } from "@/lib/i18n/alternates";
import { serializeJsonLd } from "@/lib/seo/json-ld";

/** Equivalent page per locale for the language switcher (not an SEO signal; hreflang is emitted separately). */
export function PageLanguageLinks({ links }: { links: Alternates }) {
  return <script type="application/json" id="kornne-lang-links" dangerouslySetInnerHTML={{ __html: serializeJsonLd(links) }} />;
}
