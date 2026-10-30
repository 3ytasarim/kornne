# KORNNE Web

Next.js 16 (App Router) + TypeScript + Tailwind 4 + Prisma 7 / PostgreSQL (Neon) e-ticaret platformu. Durum: Sprint 0–7 tamam (bkz. `docs/SPRINT-0-1-REPORT.md`, `docs/sprints/sprint-2-3-report.md`, `docs/sprints/sprint-4-5-report.md`, `docs/sprints/sprint-6-7-report.md`); fiyatlı checkout kilitli (`docs/architecture/commerce-modes.md`). Çalışma alanı: `D:\Projects\kornne` (PestShield deposundan ayrıldı).

## Kurulum

```bash
npm ci
cp .env.example .env   # DATABASE_URL / DIRECT_URL (Neon), IP_HASH_SALT, SITE_URL
npm run db:deploy      # yalnız ileri migrasyon (asla reset/shadow DB)
npm run dev            # http://localhost:3460
```

Admin kullanıcısı (varsayılan hesap/şifre YOKTUR; değerler ortam değişkeninden okunur, yazdırılmaz):

```bash
ADMIN_EMAIL=… ADMIN_NAME=… ADMIN_PASSWORD=… npm run admin:create
```

## Veri aktarımı (Sprint 2)

```bash
npm run db:identity                                        # hedef DB kimliği + sayımlar (salt-okunur)
npm run import:legacy                                      # dry-run (yazmaz)
npm run import:legacy -- --apply --confirm-db=<endpoint>   # tek transaction, idempotent
npm run import:rollback -- --run=<ImportRun id>            # dry-run; --apply --confirm-db ile geri alır
node scripts/verify-media.mjs                              # DB ↔ dosya SHA-256
npx tsx scripts/cms/seed-content.ts                        # Sprint 7 CMS tohumu (dry-run; --apply --confirm-db=<endpoint>)
```

Runbook: `docs/data-migration/import-runbook.md`.

## Kontroller

```bash
npm run db:local:start   # yerel, tek kullanımlık PostgreSQL (127.0.0.1:54391; kornne_it + kornne_e2e) — arka planda açık kalır
npm run db:local:clone   # Neon'dan SALT-OKUNUR kopya → kornne_e2e (Neon'a yazmaz)
npm run db:test:deploy   # kornne_it'e migrasyonlar (entegrasyon testleri yalnız oraya yazar)
npm run lint && npm run typecheck && npm test && npm run build
npm run test:e2e         # iki build (.next noindex :3470 + .next-prodlike üretim-benzeri :3471), yerel e2e kopyası, sistem Chrome
node scripts/test-db/serve.mjs dev|prodlike              # izole build'i elle sunar (QA / Lighthouse / SEO denetimi)
npx tsx scripts/seo/audit.ts --base=http://localhost:3470 --mode=dev        # URL bazlı teknik SEO denetimi
npx tsx scripts/seo/audit.ts --base=http://localhost:3471 --mode=prodlike   # üretim-benzeri (yalnız localhost)
npx tsx scripts/seo/image-audit.ts --db=neon             # görsel SEO / Merchant görsel denetimi (salt-okunur)
node scripts/release/smoke.mjs --base=<url> --mode=local|staging|production   # yayın sonrası smoke (125 yönlendirme dahil)
node scripts/release/check-migrations.mjs                # yıkıcı migration kapısı
node scripts/ops/backup-rehearsal.mjs                    # Neon salt-okunur → PII maskeli → izole kornne_restore geri yükleme provası
node scripts/qa/load-smoke.mjs --base=http://localhost:3470   # yerel eşzamanlılık ölçümü
# Playwright motorları ASCII yolda: PLAYWRIGHT_BROWSERS_PATH=.pw-browsers npx playwright install chromium firefox webkit
QA_SHOTS=1 npx playwright test tests/e2e/visual.spec.ts   # docs/qa/screenshots
node scripts/qa/lighthouse.mjs <lighthouse-cli-path>     # docs/qa/lighthouse (sayfa başına 3 koşu, medyan)
node scripts/qa/s67-residue.mjs                          # salt-okunur: katalog/CMS sayımları + test artığı kontrolü
npx tsx scripts/i18n-check.ts
```

## Denetim verisi (Sprint 0)

`data/source-crawl` (kornne.com salt-okunur tarama), `data/source-media/originals` (orijinal medya, gitignore) →
`npm run audit:all` → `docs/audit/*.csv` + `src/data/source-snapshot/*.json` + `src/data/redirects.json`.
`npm run media:sync` orijinalleri `public/upload/` altına (eski `/upload/<ad>` yolu korunarak) kopyalar.

## Yapı

```
src/app/[locale]/…     vitrin (SSG; TR öneksiz, en/fr/ru/ar önekli, ar RTL)
src/app/admin/…        yönetim (ayrı kök layout, RBAC modül + işlem izinleri, noindex) — docs/architecture/admin-permission-matrix.md
src/lib/admin, src/lib/cms   yönetim ve CMS servisleri (Server Action'lar ince; iş kuralları burada, entegrasyon testli)
src/proxy.ts           dil rewrite, eski 301'ler, staging Basic Auth, noindex başlığı
src/lib/catalog        CatalogRepository (S1: snapshot, S2: Prisma)
src/lib/seo            metadata, JSON-LD, SEO denetimi (audit/inventory), görsel SEO, GEO önerileri (S8)
src/lib/analytics      GA4/GTM + Consent Mode v2 (env ile KAPALI), olay sözlüğü + PII filtresi (S10)
src/lib/notifications  teklif bildirimi outbox tüketicisi (sağlayıcı yokken kapalı) (S11)
deploy/                Hetzner şablonları: PM2, Nginx, env, logrotate, preflight, release/rollback (DRY-RUN), yedek (S11)
src/lib/merchant       uygunluk motoru, feed (XML/TSV/CSV), Merchant API products_v1 adaptörü — varsayılan KAPALI (S9)
src/lib/i18n, seo, auth, money
prisma/                şema + migrasyonlar
deploy/                PM2 / Nginx / smoke test TASLAKLARI (uygulanmadı)
docs/                  audit, architecture, design, sprint planı ve rapor
```
