// Inserts the Sprint 6+7 storefront CMS keys (blog, FAQ, legal-approval notice) into every dictionary right before
// `preview`. Idempotent: skips a file that already contains `cms:`.
import { readFileSync, writeFileSync } from "node:fs";

const KEYS = {
  tr: { blogTitle: "Blog ve haberler", blogLead: "KORNNE'den duyurular ve teknik yazılar.", readMore: "Devamını oku", publishedOn: "Yayın tarihi: {date}", allPosts: "Tüm yazılar", faqTitle: "Sıkça sorulan sorular", faqLead: "Ürünler ve teklif süreci hakkında sık sorulanlar.", productFaq: "Bu ürün hakkında sorular", blogNav: "Blog", faqNav: "SSS", legalPending: "Bu yasal metin hukuki onay sürecindedir.", announcement: "Duyuru" },
  en: { blogTitle: "Blog & news", blogLead: "Announcements and technical articles from KORNNE.", readMore: "Read more", publishedOn: "Published: {date}", allPosts: "All posts", faqTitle: "Frequently asked questions", faqLead: "Common questions about our products and the quotation process.", productFaq: "Questions about this product", blogNav: "Blog", faqNav: "FAQ", legalPending: "This legal text is pending legal approval.", announcement: "Announcement" },
  fr: { blogTitle: "Blog et actualités", blogLead: "Annonces et articles techniques de KORNNE.", readMore: "Lire la suite", publishedOn: "Publié le : {date}", allPosts: "Tous les articles", faqTitle: "Questions fréquentes", faqLead: "Questions courantes sur nos produits et le processus de devis.", productFaq: "Questions sur ce produit", blogNav: "Blog", faqNav: "FAQ", legalPending: "Ce texte juridique est en cours de validation.", announcement: "Annonce" },
  ru: { blogTitle: "Блог и новости", blogLead: "Объявления и технические статьи KORNNE.", readMore: "Читать далее", publishedOn: "Опубликовано: {date}", allPosts: "Все статьи", faqTitle: "Частые вопросы", faqLead: "Частые вопросы о продукции и запросе цены.", productFaq: "Вопросы об этом продукте", blogNav: "Блог", faqNav: "Вопросы", legalPending: "Этот юридический текст находится на согласовании.", announcement: "Объявление" },
  ar: { blogTitle: "المدونة والأخبار", blogLead: "إعلانات ومقالات تقنية من KORNNE.", readMore: "اقرأ المزيد", publishedOn: "تاريخ النشر: {date}", allPosts: "جميع المقالات", faqTitle: "الأسئلة الشائعة", faqLead: "أسئلة شائعة حول منتجاتنا وطلب عرض السعر.", productFaq: "أسئلة حول هذا المنتج", blogNav: "المدونة", faqNav: "الأسئلة الشائعة", legalPending: "هذا النص القانوني قيد المراجعة القانونية.", announcement: "إعلان" },
};

for (const [locale, sections] of Object.entries(KEYS)) {
  const file = `src/lib/i18n/dictionaries/${locale}.ts`;
  const src = readFileSync(file, "utf8");
  if (src.includes("\n  cms:")) continue;
  const block = `  cms: ${JSON.stringify(sections).replace(/"([a-zA-Z]+)":/g, "$1: ")},\n`;
  const at = src.indexOf("\n  preview:");
  if (at < 0) throw new Error(`no preview section in ${file}`);
  writeFileSync(file, src.slice(0, at + 1) + block + src.slice(at + 1));
  console.log("updated", file);
}
