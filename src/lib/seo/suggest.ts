/**
 * SEO title / description suggestions for products whose SEO fields are empty. Built only from the product's own
 * content (title, category, description text) — no invented claims. Lengths follow Google's display limits:
 * the layout appends " | KORNNE" (9 chars) to every title, so the title part stays ≤ 51 characters; descriptions
 * aim for 120–155 characters and are cut at a word boundary.
 */
const TITLE_MAX = 51;
const DESC_MAX = 155;

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

// named entities that occur in the legacy catalog HTML (Turkish letters, punctuation)
const ENTITIES: Record<string, string> = {
  nbsp: " ", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">",
  ouml: "ö", Ouml: "Ö", uuml: "ü", Uuml: "Ü", ccedil: "ç", Ccedil: "Ç",
  bull: "•", middot: "·", ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
  deg: "°", times: "×", sup2: "²", sup3: "³", frac12: "½", plusmn: "±",
  eacute: "é", egrave: "è", agrave: "à", ecirc: "ê", icirc: "î", acirc: "â",
};

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]*);/gi, (m, e: string) => {
    if (e.startsWith("#x") || e.startsWith("#X")) return String.fromCodePoint(parseInt(e.slice(2), 16));
    if (e.startsWith("#")) return String.fromCodePoint(parseInt(e.slice(1), 10));
    return ENTITIES[e] ?? m;
  });
}

export function htmlToText(html: string | null | undefined): string {
  const text = decode(
    (html ?? "")
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>|<\/(p|li|h\d|div|tr)>/gi, ". ")
      .replace(/<[^>]+>/g, " "),
  );
  return squash(
    text
      .replace(/\s*•\s*/g, ". ")
      .replace(/\s+([.,:;])/g, "$1")
      .replace(/(\.\s*){2,}/g, ". ")
      .replace(/^[.\s]+/, ""),
  );
}

/** Drops heading-like fragments (ALL CAPS, or just the product name with a prefix) and keeps factual sentences. */
function informative(text: string, title: string, locale: string): string {
  const t = title.toLocaleLowerCase(locale);
  return text
    .split(/(?<=[.!?])\s+/)
    .map((x) => x.trim())
    .filter((x) => {
      const letters = x.replace(/[^\p{L}]/gu, "");
      if (letters.length < 3) return false;
      if (letters.length > 3 && letters === letters.toLocaleUpperCase(locale)) return false; // "TEKNİK ÖZELLİKLER"
      const low = x.toLocaleLowerCase(locale).replace(/[.!?]$/, "");
      if (/^teknik özellik/.test(low)) return false;
      return !(low.includes(t) && low.length < t.length + 28); // "Mezbaha Sistemleri Dairesel Kesim Hücresi"
    })
    .join(" ");
}

function cut(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max - 1);
  const sentence = slice.lastIndexOf(". ");
  if (sentence > max * 0.6) return slice.slice(0, sentence + 1);
  return `${slice.replace(/\s+\S*$/, "").replace(/[,;:–—-]\s*$/, "")}…`;
}

/** Fallback sentence per locale when the description text is too short to summarise. */
const FALLBACK: Record<string, (title: string, category: string | null) => string> = {
  tr: (t, c) => `${t}${c ? ` — ${c}` : ""}. KORNNE mezbaha ve kesimhane ekipmanları: KDV dahil fiyat, EFT / Havale ile sipariş, teknik destek.`,
  en: (t, c) => `${t}${c ? ` — ${c}` : ""}. KORNNE slaughterhouse equipment: prices incl. VAT, order by bank transfer, technical support.`,
  fr: (t, c) => `${t}${c ? ` — ${c}` : ""}. Équipements d'abattoir KORNNE : prix TTC, commande par virement, assistance technique.`,
  ru: (t, c) => `${t}${c ? ` — ${c}` : ""}. Оборудование для боен KORNNE: цены с НДС, заказ банковским переводом, техническая поддержка.`,
  ar: (t, c) => `${t}${c ? ` — ${c}` : ""}. معدات المسالخ من KORNNE: أسعار شاملة الضريبة، الطلب بالحوالة البنكية، دعم فني.`,
};

export function suggestSeo(input: { locale: string; title: string; category?: string | null; shortDescription?: string | null; descriptionHtml?: string | null }) {
  const title = squash(decode(input.title));
  const category = input.category ? squash(input.category) : null;
  const withCategory = category && !title.toLocaleLowerCase(input.locale).includes(category.toLocaleLowerCase(input.locale)) ? `${title} — ${category}` : title;
  const seoTitle = withCategory.length <= TITLE_MAX ? withCategory : cut(title, TITLE_MAX);

  // prefer the richer text: a short description is often just a tagline, the long description carries the facts
  const short = informative(htmlToText(input.shortDescription), title, input.locale);
  const long = informative(htmlToText(input.descriptionHtml), title, input.locale);
  const body = short.length >= 90 || short.length >= long.length ? short : long;
  // lead with the product name (what people search for), then the product's own facts
  const seoDescription = body.length >= 40 ? cut(`${title}: ${body}`, DESC_MAX) : cut((FALLBACK[input.locale] ?? FALLBACK.tr!)(title, category), DESC_MAX);
  return { seoTitle, seoDescription };
}
