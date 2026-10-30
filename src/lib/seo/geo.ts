/**
 * GEO (generative engine optimization) advisor — Sprint 8. Reads the REAL published text and returns SUGGESTIONS
 * only: it never writes, rewrites or invents content (no specs, prices, certificates, claims or translations).
 * Every suggestion names the evidence it is based on so an editor can act on it in the product/content editor.
 */
export type GeoSuggestion = { code: string; priority: "high" | "medium" | "low"; message: string; evidence: string };
export type GeoInput = { title: string; descriptionText: string; descriptionHtml: string; seoDescription: string | null; verifiedSpecs: number; faqCount: number; imageAltsByEditor: number; images: number };

const sentences = (t: string) => t.split(/(?<=[.!?…])\s+/).filter((s) => s.trim().length > 0);

export function geoSuggestions(p: GeoInput): GeoSuggestion[] {
  const out: GeoSuggestion[] = [];
  const text = p.descriptionText.replace(/\s+/g, " ").trim();
  const words = text ? text.split(" ").length : 0;
  if (words < 60) out.push({ code: "thin", priority: "high", message: "Açıklama çok kısa: yapay zekâ yanıt motorları alıntılayacak somut bilgi bulamaz.", evidence: `${words} kelime` });
  // "label : value" lines inside free text = specs that are not structured (and not verified)
  const specLike = (p.descriptionHtml.match(/(?:^|[>•\n])\s*[A-ZÇĞİÖŞÜa-zçğıöşü][^:<>\n]{2,40}\s:\s*[^<\n]{1,80}/g) ?? []).length;
  if (specLike >= 3 && p.verifiedSpecs === 0) out.push({ code: "unstructured-specs", priority: "high", message: "Metinde teknik özellik satırları var ama doğrulanmış teknik tablo yok. Müşteri değerleri teyit ederse Admin › Ürün › Teknik özellikler’e girilmeli (otomatik aktarılmaz).", evidence: `${specLike} “Özellik : değer” satırı` });
  if (/olacaktır|olmalıdır|edilecektir/i.test(text)) out.push({ code: "tender-language", priority: "medium", message: "Metin ihale şartnamesi diliyle yazılmış (“…olacaktır”). Ürünün ne olduğunu ve kime uygun olduğunu anlatan 2–3 cümlelik net bir giriş, alıntılanabilirliği artırır.", evidence: "“olacaktır/olmalıdır” kalıbı" });
  const first = sentences(text)[0] ?? "";
  if (first && !first.toLowerCase().includes(p.title.split(" ")[0]!.toLowerCase())) out.push({ code: "entity-first", priority: "medium", message: "İlk cümle ürünün adını içermiyor. “<Ürün adı>, … için kullanılan …dır.” biçiminde tanımlayıcı bir açılış önerilir (bilgi müşteriden).", evidence: `İlk cümle: “${first.slice(0, 80)}”` });
  const longParas = (p.descriptionHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) ?? []).filter((x) => x.replace(/<[^>]+>/g, "").split(/\s+/).length > 90).length;
  if (longParas) out.push({ code: "long-paragraphs", priority: "low", message: "Uzun paragraflar: kısa paragraflar ve maddeler yanıt motorlarında daha iyi parçalanır.", evidence: `${longParas} paragraf > 90 kelime` });
  if (!/<(ul|ol|h2|h3|table)\b/i.test(p.descriptionHtml) && words > 80) out.push({ code: "no-structure", priority: "low", message: "Başlık / madde / tablo yok. Mevcut bilgiyi alt başlıklarla bölmek yeterli (yeni bilgi eklemeden).", evidence: "ul/ol/h2/h3/table yok" });
  if (p.faqCount === 0) out.push({ code: "no-faq", priority: "medium", message: "Ürüne bağlı yayında soru-cevap yok. Müşterinin gerçekten aldığı sorular (teslim, kurulum, kapasite) ve kaynaklı yanıtlar FAQPage verisi olarak eklenebilir.", evidence: "0 yayımlanmış SSS" });
  if (!p.seoDescription) out.push({ code: "no-meta", priority: "low", message: "Editör SEO açıklaması yok; metnin ilk 160 karakteri kullanılıyor.", evidence: "seoDescription boş" });
  if (p.images && p.imageAltsByEditor < p.images) out.push({ code: "alt-auto", priority: "low", message: "Görsel alt metinleri ürün adından otomatik; görselin ne gösterdiğini anlatan alt metin yazılmalı.", evidence: `${p.images - p.imageAltsByEditor}/${p.images} görsel` });
  return out;
}

/** Site-level GEO checklist: facts about the deployment, not content generation. */
export function siteGeoChecks(s: { hasLlmsTxt: boolean; organizationVerified: boolean; faqPublished: number; robotsAllowsAiBots: boolean | null }): GeoSuggestion[] {
  const out: GeoSuggestion[] = [];
  if (!s.hasLlmsTxt) out.push({ code: "llms-txt", priority: "low", message: "llms.txt yok. Yalnız doğrulanmış kurum bilgisi ve ana sayfa/kategori bağlantılarıyla hazırlanabilir (müşteri onayı ile, yayına geçişte).", evidence: "public/llms.txt yok" });
  if (!s.organizationVerified) out.push({ code: "org-unverified", priority: "high", message: "Ticari unvan / vergi bilgileri doğrulanmadı: Organization verisi yalnız ad, URL, logo ve sitede yayımlı iletişimle sınırlı. Kaynak sitede üç farklı satıcı kimliği var — E-E-A-T için netleştirilmeli.", evidence: "company.legalName doğrulanmamış" });
  if (s.faqPublished === 0) out.push({ code: "site-faq", priority: "medium", message: "Site SSS sayfası boş (404). Gerçek müşteri soruları ve kaynaklı yanıtlar answer-engine görünürlüğü için en etkili içeriktir.", evidence: "0 yayımlanmış SSS" });
  if (s.robotsAllowsAiBots === false) out.push({ code: "ai-bots-blocked", priority: "high", message: "robots.txt yapay zekâ tarayıcılarını engelliyor.", evidence: "robots.txt" });
  return out;
}
