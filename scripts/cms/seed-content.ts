/**
 * Sprint 7 — moves the CMS content that the storefront ALREADY shows into the new CMS tables, so editors can manage it:
 *  - the 4 legacy pages (kurumsal + 3 Turkish-only legal texts) from the captured kornne.com snapshot, as
 *    PUBLISHED revisions (legal texts stay "not legally approved"; languages without own text get an EMPTY body →
 *    storefront shows the Turkish text with a notice, exactly like before)
 *  - the header / footer links that were hard-coded
 *  - contact / social settings (values captured from kornne.com, status UNVERIFIED)
 *
 * Additive and idempotent: existing rows are NEVER updated or deleted (an editor's change always wins).
 *   npx tsx scripts/cms/seed-content.ts                                   # dry-run, writes nothing
 *   npx tsx scripts/cms/seed-content.ts --apply --confirm-db=<endpoint>   # writes in one transaction
 */
import "dotenv/config";
import { PrismaClient, type Locale, type PageKind } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import catalog from "../../src/data/source-snapshot/catalog.json";
import { sanitizeRichText } from "../../src/lib/catalog/sanitize";
import { SETTING_DEFS } from "../../src/lib/cms/settings";
import { ar } from "../../src/lib/i18n/dictionaries/ar";
import { de } from "../../src/lib/i18n/dictionaries/de";
import { en } from "../../src/lib/i18n/dictionaries/en";
import { fr } from "../../src/lib/i18n/dictionaries/fr";
import { ru } from "../../src/lib/i18n/dictionaries/ru";
import { tr } from "../../src/lib/i18n/dictionaries/tr";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const confirm = [...args].find((a) => a.startsWith("--confirm-db="))?.split("=")[1];
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) throw new Error("DIRECT_URL / DATABASE_URL is not set");
const endpoint = new URL(url).hostname.split(".")[0]!.replace(/-pooler$/, "");
if (apply && confirm !== endpoint) throw new Error(`--apply needs --confirm-db=${endpoint} (target check)`);

// Same definitions the Sprint 1 snapshot reader used (src/lib/content/pages.ts)
const PAGES: { key: string; kind: PageKind; slugs: Partial<Record<Locale, string>>; legacySlugs: Partial<Record<Locale, string>> }[] = [
  { key: "kurumsal", kind: "CORPORATE", slugs: { tr: "kurumsal", en: "corporate-information", fr: "information-dentreprise", ru: "o-kompanii", ar: "about-us" }, legacySlugs: { tr: "kurumsal", en: "corporate-information", fr: "information-dentreprise", ru: "lang-russian-corparate", ar: "lang-arabic-corparate" } },
  { key: "iade-ve-geri-odeme-politikalari", kind: "LEGAL", slugs: { tr: "iade-ve-geri-odeme-politikalari" }, legacySlugs: { tr: "iade-ve-geri-odeme-politikalari" } },
  { key: "mesafeli-satis-sozlesmesi", kind: "LEGAL", slugs: { tr: "mesafeli-satis-sozlesmesi" }, legacySlugs: { tr: "mesafeli-satis-sozlesmesi" } },
  { key: "kisisel-verilenin-korunmasi-kanunu", kind: "LEGAL", slugs: { tr: "kisisel-verilenin-korunmasi-kanunu" }, legacySlugs: { tr: "kisisel-verilenin-korunmasi-kanunu" } },
];
const D = { tr, en, de, fr, ru, ar } as const;
const L: Locale[] = ["tr", "en", "de", "fr", "ru", "ar"];
const labels = (pick: (d: (typeof D)["tr"]) => string) => Object.fromEntries(L.map((l) => [l, pick(D[l] as (typeof D)["tr"])]));
const MENUS = [
  { location: "HEADER" as const, kind: "page", pageKey: "kurumsal", labels: labels((d) => d.nav.corporate), sortOrder: 10 },
  { location: "HEADER" as const, kind: "path", path: "/iletisim", labels: labels((d) => d.nav.contact), sortOrder: 20 },
  { location: "HEADER" as const, kind: "path", path: "/blog", labels: labels((d) => d.cms.blogNav), sortOrder: 30 },
  { location: "HEADER" as const, kind: "path", path: "/sss", labels: labels((d) => d.cms.faqNav), sortOrder: 40 },
  { location: "FOOTER_LEGAL" as const, kind: "page", pageKey: "kurumsal", labels: labels((d) => d.nav.corporate), sortOrder: 10 },
  { location: "FOOTER_LEGAL" as const, kind: "page", pageKey: "iade-ve-geri-odeme-politikalari", labels: labels((d) => d.footer.returns), sortOrder: 20 },
  { location: "FOOTER_LEGAL" as const, kind: "page", pageKey: "mesafeli-satis-sozlesmesi", labels: labels((d) => d.footer.distanceSales), sortOrder: 30 },
  { location: "FOOTER_LEGAL" as const, kind: "page", pageKey: "kisisel-verilenin-korunmasi-kanunu", labels: labels((d) => d.footer.kvkk), sortOrder: 40 },
];

async function main() {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
  const plan = { pages: [] as string[], translations: [] as string[], menus: 0, settings: [] as string[], skipped: [] as string[] };
  try {
    const existingPages = new Set((await db.page.findMany({ select: { key: true } })).map((p) => p.key));
    const menuCount = await db.menuItem.count();
    const existingSettings = new Set((await db.siteSetting.findMany({ select: { key: true } })).map((s) => s.key));
    for (const p of PAGES) {
      if (existingPages.has(p.key)) {
        plan.skipped.push(`page ${p.key} (exists)`);
        continue;
      }
      plan.pages.push(p.key);
      for (const l of L) if (p.slugs[l] && catalog.pages.some((x) => x.locale === l && x.slug === p.legacySlugs[l])) plan.translations.push(`${p.key}:${l}`);
    }
    if (menuCount === 0) plan.menus = MENUS.length;
    else plan.skipped.push(`menus (${menuCount} rows exist)`);
    for (const [k, def] of Object.entries(SETTING_DEFS)) if ("seed" in def && def.seed && !existingSettings.has(k)) plan.settings.push(k);

    console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", endpoint, plan }, null, 1));
    if (!apply) return;

    await db.$transaction(
      async (tx) => {
        const now = new Date();
        for (const key of plan.pages) {
          const def = PAGES.find((p) => p.key === key)!;
          const page = await tx.page.create({ data: { key, kind: def.kind, status: "PUBLISHED" } });
          for (const l of L) {
            const slug = def.slugs[l];
            const src = catalog.pages.find((x) => x.locale === l && x.slug === def.legacySlugs[l]);
            if (!slug || !src) continue;
            // own text only when the legacy page really had one (> 40 chars); otherwise empty → Turkish fallback + notice
            const body = l === "tr" || src.body_text.trim().length > 40 ? sanitizeRichText(src.body_html) : "";
            const title = src.title.normalize("NFC");
            const t = await tx.pageTranslation.create({ data: { pageId: page.id, locale: l, title, slug, bodyHtml: body, state: "PUBLISHED", status: "LEGACY_SOURCE" } });
            const rev = await tx.pageRevision.create({ data: { pageTranslationId: t.id, title, slug, bodyHtml: body, note: `kornne.com'dan aktarıldı (${src.source_url})` } });
            await tx.pageTranslation.update({ where: { id: t.id }, data: { publishedRevisionId: rev.id, publishedSlug: slug, publishedAt: now } });
          }
          await tx.auditLog.create({ data: { action: "content.seeded", entityType: "Page", entityId: page.id, after: { key, source: "kornne.com snapshot 2026-10-21" } } });
        }
        if (plan.menus) await tx.menuItem.createMany({ data: MENUS.map((m) => ({ location: m.location, kind: m.kind, pageKey: m.pageKey ?? null, path: m.path ?? null, labels: m.labels, sortOrder: m.sortOrder })) });
        for (const k of plan.settings) {
          const def = SETTING_DEFS[k as keyof typeof SETTING_DEFS] as { seed?: string };
          await tx.siteSetting.create({ data: { key: k, value: def.seed!, status: "UNVERIFIED", source: k.startsWith("operations.") ? "taslak varsayılan (hukuki onay yok)" : "kornne.com yayınındaki bilgi (2026-10-21), doğrulanmadı" } });
        }
        await tx.auditLog.create({ data: { action: "content.seed_run", entityType: "System", after: { pages: plan.pages.length, translations: plan.translations.length, menus: plan.menus, settings: plan.settings.length } } });
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
    console.log("applied");
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
