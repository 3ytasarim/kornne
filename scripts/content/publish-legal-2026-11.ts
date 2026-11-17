/**
 * Legal pages for the iyzico merchant review (client request 17.11.2026), English first:
 *   - Shipping Policy: English updated (orders within Türkiye added) + Turkish / German / French / Russian / Arabic
 *   - Privacy Policy: English updated (card payments via iyzico, security) + Turkish / German / French / Russian / Arabic
 *   - Distance Sales Agreement: new English version + Turkish rewritten (Law 6502 / Distance Contracts Regulation,
 *     14-day withdrawal, card + bank transfer payment) — replaces the legacy template (Law 4077, placeholders)
 *   - Return & Refund Policy: refund paragraph (en/de/fr/ru/ar) now covers card refunds
 *   - footer menu labels of Shipping / Privacy in every language
 * Texts: content/legal-2026-11/*.html. Written through the CMS service (revision + publish + audit log), so every
 * previous version stays in the page history and can be restored in Admin › İçerik.
 * Safety: an existing text is replaced only if the live published text is still the one this change was written
 * against (hash); otherwise that page is SKIPPED and reported (nobody's later edit is overwritten). Re-running changes
 * nothing.
 *
 * DRY RUN by default:
 *   npx tsx --conditions=react-server scripts/content/publish-legal-2026-11.ts --db=neon --legal-ref="..."
 * Write:
 *   npx tsx --conditions=react-server scripts/content/publish-legal-2026-11.ts --db=neon --legal-ref="..." --apply --confirm-db=<endpoint>
 * Then rebuild / restart the app (or wait for the cache) to see the pages.
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Locale } from "@prisma/client";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { sanitizeRichText } from "../../src/lib/catalog/sanitize";
import { publishPage, savePageDraft, setLegalApproval } from "../../src/lib/cms/service";
import { testDatabaseUrl } from "../../tests/test-db-url.mjs";

const DIR = join(__dirname, "../../content/legal-2026-11");
const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const APPLY = process.argv.includes("--apply");
const DB = arg("db") ?? "e2e";
const LEGAL_REF = arg("legal-ref")?.trim() ?? "";
const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);
const file = (name: string) => readFileSync(join(DIR, name), "utf8").trim();

type Full = { key: string; locale: Locale; file: string; title?: string; slug?: string; seoTitle?: string; seoDescription?: string; baseline?: string };
type Replace = { key: string; locale: Locale; old: string; new: string };

// baseline = hash of the live text this change was written against (only for texts that already exist)
const FULL: Full[] = [
  { key: "shipping-policy", locale: "en", file: "shipping-policy.en.html", baseline: "652831f7b9d9e24b", seoDescription: "Orders within Türkiye have no separate shipping charge; orders abroad ship from Kocaeli for a flat USD 100 per order. Import duties are paid by the buyer." },
  { key: "shipping-policy", locale: "tr", file: "shipping-policy.tr.html", title: "Teslimat Koşulları", slug: "teslimat-kosullari", seoDescription: "Teslimat koşulları: Türkiye içi teslimat, yurt dışına sipariş başına sabit 100 USD, gümrük vergileri, teslim süreleri ve taşıma hasarı bildirimi." },
  { key: "shipping-policy", locale: "de", file: "shipping-policy.de.html", title: "Versandrichtlinie", slug: "versandrichtlinie", seoDescription: "Versand bei KORNNE: Lieferung in der Türkei, pauschal 100 USD je Bestellung ins Ausland, Zölle, Lieferzeiten und Meldung von Transportschäden." },
  { key: "shipping-policy", locale: "fr", file: "shipping-policy.fr.html", title: "Politique de livraison", slug: "politique-de-livraison", seoDescription: "Livraison KORNNE : commandes en Turquie, frais forfaitaires de 100 USD par commande à l’export, droits de douane, délais et signalement des dommages." },
  { key: "shipping-policy", locale: "ru", file: "shipping-policy.ru.html", title: "Политика доставки", slug: "politika-dostavki", seoDescription: "Доставка KORNNE: заказы по Турции, фиксированная плата 100 USD за заказ при отправке за рубеж, таможенные платежи, сроки и повреждения при перевозке." },
  { key: "shipping-policy", locale: "ar", file: "shipping-policy.ar.html", title: "سياسة الشحن", slug: "shipping-policy", seoDescription: "شحن KORNNE: الطلبات داخل تركيا، رسوم شحن ثابتة USD 100 لكل طلب للخارج، الرسوم الجمركية، مدد التسليم والإبلاغ عن التلف أثناء النقل." },
  { key: "privacy-policy", locale: "en", file: "privacy-policy.en.html", baseline: "d7e06d8e19c0d62b" },
  { key: "privacy-policy", locale: "tr", file: "privacy-policy.tr.html", title: "Gizlilik Politikası", slug: "gizlilik-politikasi", seoDescription: "Mezbaha Teknolojileri (KORNNE) kişisel verileri nasıl işler: toplanan veriler, amaçlar, kartla ödeme güvenliği, paylaşım, saklama süresi ve haklarınız." },
  { key: "privacy-policy", locale: "de", file: "privacy-policy.de.html", title: "Datenschutzerklärung", slug: "datenschutzerklaerung", seoDescription: "Wie KORNNE (Mezbaha Teknolojileri) personenbezogene Daten gemäß KVKK und DSGVO verarbeitet: Datenarten, Zwecke, Weitergabe, Aufbewahrung und Ihre Rechte." },
  { key: "privacy-policy", locale: "fr", file: "privacy-policy.fr.html", title: "Politique de confidentialité", slug: "politique-de-confidentialite", seoDescription: "Comment KORNNE (Mezbaha Teknolojileri) traite vos données personnelles selon la KVKK et le RGPD : données collectées, finalités, partage, durées et droits." },
  { key: "privacy-policy", locale: "ru", file: "privacy-policy.ru.html", title: "Политика конфиденциальности", slug: "politika-konfidencialnosti", seoDescription: "Как KORNNE (Mezbaha Teknolojileri) обрабатывает персональные данные согласно KVKK и GDPR: состав данных, цели, передача, сроки хранения и ваши права." },
  { key: "privacy-policy", locale: "ar", file: "privacy-policy.ar.html", title: "سياسة الخصوصية", slug: "privacy-policy", seoDescription: "كيف تعالج KORNNE (Mezbaha Teknolojileri) بياناتك الشخصية وفق KVKK وGDPR: البيانات المجمعة والأغراض والمشاركة ومدة الاحتفاظ وحقوقك." },
  { key: "mesafeli-satis-sozlesmesi", locale: "en", file: "mesafeli-satis-sozlesmesi.en.html", title: "Distance Sales Agreement", slug: "distance-sales-agreement", seoTitle: "Distance Sales Agreement", seoDescription: "Distance Sales Agreement for orders on kornne.com: parties, prices, card and bank transfer payment, delivery, 14-day withdrawal, warranty and disputes." },
  { key: "mesafeli-satis-sozlesmesi", locale: "tr", file: "mesafeli-satis-sozlesmesi.tr.html", baseline: "9e5d1d1b9022a910", seoTitle: "Mesafeli Satış Sözleşmesi", seoDescription: "kornne.com siparişleri için mesafeli satış sözleşmesi: taraflar, fiyat, kartla ve havaleyle ödeme, teslimat, 14 gün cayma hakkı, garanti ve uyuşmazlıklar." },
];

const REFUND: Replace[] = [
  {
    key: "iade-ve-geri-odeme-politikalari",
    locale: "en",
    old: "<p>After the returned item arrives and is inspected, the refund is made to the original payment account (bank transfer, in the currency paid). Deductions may apply if the item or its original packaging is damaged.</p>",
    new: "<p>After the returned item arrives and is inspected, the refund is made with the original payment method in the currency paid: card payments are refunded to the same card through our payment service provider iyzico, bank transfers to the originating account. Deductions may apply if the item or its original packaging is damaged. The time for a card refund to appear on your statement depends on your bank.</p>",
  },
  {
    key: "iade-ve-geri-odeme-politikalari",
    locale: "de",
    old: "<p>Nach Eingang und Prüfung des zurückgesendeten Artikels erfolgt die Erstattung auf das ursprüngliche Zahlungskonto (Banküberweisung, in der gezahlten Währung). Bei Beschädigung des Artikels oder der Originalverpackung können Abzüge erfolgen.</p>",
    new: "<p>Nach Eingang und Prüfung des zurückgesendeten Artikels erfolgt die Erstattung über die ursprüngliche Zahlungsart in der gezahlten Währung: Kartenzahlungen werden über unseren Zahlungsdienstleister iyzico auf dieselbe Karte erstattet, Banküberweisungen auf das Ausgangskonto. Bei Beschädigung des Artikels oder der Originalverpackung können Abzüge erfolgen. Wann eine Kartenerstattung auf Ihrer Abrechnung erscheint, hängt von Ihrer Bank ab.</p>",
  },
  {
    key: "iade-ve-geri-odeme-politikalari",
    locale: "fr",
    old: "<p>Après réception et contrôle de l'article retourné, le remboursement est effectué sur le compte de paiement d'origine (virement bancaire, dans la devise payée). Des déductions peuvent s'appliquer si l'article ou son emballage d'origine est endommagé.</p>",
    new: "<p>Après réception et contrôle de l'article retourné, le remboursement est effectué par le moyen de paiement d'origine, dans la devise payée : les paiements par carte sont remboursés sur la même carte via notre prestataire de paiement iyzico, les virements bancaires sur le compte d'origine. Des déductions peuvent s'appliquer si l'article ou son emballage d'origine est endommagé. Le délai d'apparition d'un remboursement par carte sur votre relevé dépend de votre banque.</p>",
  },
  {
    key: "iade-ve-geri-odeme-politikalari",
    locale: "ru",
    old: "<p>После поступления и проверки возвращённого товара средства возвращаются на исходный платёжный счёт (банковским переводом, в валюте оплаты). При повреждении товара или его оригинальной упаковки возможны удержания.</p>",
    new: "<p>После поступления и проверки возвращённого товара средства возвращаются тем же способом оплаты и в той же валюте: оплата картой возвращается на ту же карту через нашего платёжного провайдера iyzico, банковский перевод — на исходный счёт. При повреждении товара или его оригинальной упаковки возможны удержания. Срок зачисления возврата на карту зависит от вашего банка.</p>",
  },
  {
    key: "iade-ve-geri-odeme-politikalari",
    locale: "ar",
    old: "<p>بعد وصول المنتج المرتجع وفحصه، يُعاد المبلغ إلى حساب الدفع الأصلي (تحويل بنكي، بعملة الدفع). وقد تُخصم مبالغ في حال تضرر المنتج أو عبوته الأصلية.</p>",
    new: "<p>بعد وصول المنتج المرتجع وفحصه، يُعاد المبلغ بطريقة الدفع الأصلية وبعملة الدفع: تُعاد مدفوعات البطاقة إلى البطاقة نفسها عبر مزوّد خدمات الدفع لدينا iyzico، وتُعاد التحويلات البنكية إلى الحساب الأصلي. وقد تُخصم مبالغ في حال تضرر المنتج أو عبوته الأصلية. تعتمد مدة ظهور المبلغ المسترد في كشف حساب البطاقة على البنك الذي تتعامل معه.</p>",
  },
];

const MENU_LABELS: Record<string, Record<string, string>> = {
  "shipping-policy": { en: "Shipping Policy", tr: "Teslimat Koşulları", de: "Versandrichtlinie", fr: "Politique de livraison", ru: "Политика доставки", ar: "سياسة الشحن" },
  "privacy-policy": { en: "Privacy Policy", tr: "Gizlilik Politikası", de: "Datenschutzerklärung", fr: "Politique de confidentialité", ru: "Политика конфиденциальности", ar: "سياسة الخصوصية" },
};

async function main() {
  let url: string;
  if (DB === "e2e") url = testDatabaseUrl("e2e");
  else {
    url = process.env.DIRECT_URL || process.env.DATABASE_URL || "";
    const endpoint = new URL(url).hostname.split(".")[0]!.replace(/-pooler$/, "");
    if (APPLY && arg("confirm-db") !== endpoint) throw new Error(`REFUSED: pass --confirm-db=${endpoint} to write to this database`);
  }
  if (LEGAL_REF.length < 5) throw new Error('--legal-ref="<kim, ne zaman onayladı>" gerekli (yasal onay referansı)');
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }), transactionOptions: { maxWait: 10_000, timeout: 60_000 } });
  try {
    const user = await db.user.findFirst({ where: { role: "SUPER_ADMIN", active: true }, orderBy: { createdAt: "asc" }, select: { id: true, email: true } });
    if (!user) throw new Error("REFUSED: no active SUPER_ADMIN");
    const actor = { id: user.id, canPublish: true };
    const pages = await db.page.findMany({ where: { key: { in: [...new Set([...FULL, ...REFUND].map((x) => x.key))] } }, include: { translations: { include: { publishedRevision: { select: { bodyHtml: true } } } } } });
    const pageOf = (key: string) => {
      const p = pages.find((x) => x.key === key);
      if (!p) throw new Error(`REFUSED: page "${key}" not found`);
      return p;
    };

    type Job = { label: string; pageId: string; locale: Locale; title: string; slug: string; bodyHtml: string; excerpt?: string; seoTitle?: string; seoDescription?: string };
    const jobs: Job[] = [];
    const report: string[] = [];
    for (const f of FULL) {
      const p = pageOf(f.key);
      const t = p.translations.find((x) => x.locale === f.locale);
      const live = t?.publishedRevision?.bodyHtml ?? null;
      const body = file(f.file);
      const label = `${f.key} [${f.locale}]`;
      if (live !== null && live.trim() === sanitizeRichText(body).trim()) {
        report.push(`${label}: zaten güncel`);
        continue;
      }
      if (t && f.baseline && live !== null && sha(live) !== f.baseline) {
        report.push(`${label}: ATLANDI — canlı metin bu değişiklikten sonra değiştirilmiş (elle kontrol edin)`);
        continue;
      }
      if (t && !f.baseline && live) {
        report.push(`${label}: ATLANDI — bu dilde beklenmeyen bir metin var`);
        continue;
      }
      const title = f.title ?? t?.title;
      const slug = f.slug ?? t?.publishedSlug ?? t?.slug;
      if (!title || !slug) throw new Error(`${label}: title/slug missing`);
      jobs.push({ label, pageId: p.id, locale: f.locale, title, slug, bodyHtml: body, excerpt: t?.excerpt ?? undefined, seoTitle: f.seoTitle ?? t?.seoTitle ?? title, seoDescription: f.seoDescription ?? t?.seoDescription ?? undefined });
      report.push(`${label}: ${t ? "güncellenecek" : "YENİ dil"} → /${f.locale}/…/${slug} (${body.length} karakter)`);
    }
    for (const r of REFUND) {
      const p = pageOf(r.key);
      const t = p.translations.find((x) => x.locale === r.locale);
      const live = t?.publishedRevision?.bodyHtml ?? "";
      const label = `${r.key} [${r.locale}] iade paragrafı`;
      if (live.includes(r.new) || live.includes(sanitizeRichText(r.new))) report.push(`${label}: zaten güncel`);
      else if (!t || !live.includes(r.old)) report.push(`${label}: ATLANDI — eski paragraf bulunamadı (metin değişmiş)`);
      else {
        jobs.push({ label, pageId: p.id, locale: r.locale, title: t.title, slug: t.publishedSlug ?? t.slug, bodyHtml: live.replace(r.old, r.new), excerpt: t.excerpt ?? undefined, seoTitle: t.seoTitle ?? undefined, seoDescription: t.seoDescription ?? undefined });
        report.push(`${label}: güncellenecek`);
      }
    }
    const menus = await db.menuItem.findMany({ where: { location: "FOOTER_LEGAL", kind: "page", pageKey: { in: Object.keys(MENU_LABELS) } } });
    const menuJobs = menus.filter((m) => JSON.stringify(m.labels) !== JSON.stringify({ ...(m.labels as object), ...MENU_LABELS[m.pageKey!] }));
    report.push(`Footer menü etiketleri: ${menuJobs.length} satır güncellenecek (${menus.length} satır bulundu)`);
    const legalPages = [...new Set(jobs.map((j) => j.pageId))];

    console.log(`${APPLY ? "UYGULANIYOR" : "DENEME (hiçbir şey yazılmadı)"} — veritabanı: ${DB}, yayınlayan: ${user.email}`);
    for (const l of report) console.log(`  ${l}`);
    console.log(`Yasal onay yenilenecek sayfa: ${legalPages.length} · referans: ${LEGAL_REF}`);
    if (!APPLY) return;

    for (const j of jobs) {
      await savePageDraft(db, actor, { pageId: j.pageId, locale: j.locale, title: j.title, slug: j.slug, excerpt: j.excerpt, bodyHtml: j.bodyHtml, seoTitle: j.seoTitle, seoDescription: j.seoDescription, note: `Yasal metin güncellemesi 17.11.2026 (${LEGAL_REF})` });
      await publishPage(db, actor, j.pageId, j.locale);
      console.log(`  yayınlandı: ${j.label}`);
    }
    for (const id of legalPages) await setLegalApproval(db, user, id, LEGAL_REF);
    for (const m of menuJobs) {
      const labels = { ...(m.labels as object), ...MENU_LABELS[m.pageKey!] };
      await db.menuItem.update({ where: { id: m.id }, data: { labels, updatedById: user.id } });
      await db.auditLog.create({ data: { actorId: user.id, action: "content.menu_saved", entityType: "MenuItem", entityId: m.id, before: m.labels as object, after: labels } });
    }
    console.log(`Tamam: ${jobs.length} metin yayınlandı, ${legalPages.length} sayfanın yasal onayı yenilendi, ${menuJobs.length} menü satırı güncellendi. Önceki sürümler içerik geçmişinde duruyor.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
