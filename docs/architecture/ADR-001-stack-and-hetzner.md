# ADR-001 — Teknoloji yığını ve Hetzner yayını

**Durum:** Kabul edildi (Sprint 1) · **Tarih:** 22 Ekim 2026

## Bağlam

kornne.com bugün Hostinger'da PHP 7.2 (EOL) + hazır tema ile çalışıyor; dil oturum bazlı, SEO altyapısı zayıf (robots/sitemap/hreflang yok, sahte rating). Hedef: Hetzner VPS'te çalışan, 5 dilli (AR RTL), admin panelli, SEO/GEO/Merchant uyumlu e-ticaret. Ekibin diğer projeleri (Bifire, Mezbaha Teknolojileri, Kliniva) Next.js 16 + Prisma 7 + Tailwind 4 ile, Hetzner'de Nginx + PM2 üzerinde çalışıyor.

## Karar

| Katman | Seçim | Sürüm (sabitlenmiş) | Gerekçe |
|---|---|---|---|
| Framework | Next.js App Router | 16.4.2 | SSG/ISR + SSR aynı uygulamada, Metadata API, `proxy.ts` ile dil/yönlendirme; ekip deneyimi |
| UI | React | 19.3.1 | Server Components, `useActionState` |
| Dil | TypeScript strict + `noUncheckedIndexedAccess` | ~5.9.3 | TS 7 (Go) henüz Next eklentisiyle doğrulanmadı → bilinçli olarak 5.9 |
| Stil | Tailwind CSS v4 (`@theme` token'lar) | 4.3.x | Token tabanlı tasarım sistemi, logical (RTL) utility'ler |
| Veri | PostgreSQL — **Neon** (`eu-central-1`, KORNNE'ye özel proje) | PG 18 | Müşteri kararı (22.10.2026). Diğer projelerin DB'leriyle paylaşım yok |
| ORM | Prisma | 7.10.1 + `@prisma/adapter-pg` | `latest` etiketi 8.0 RC → bilinçli 7.10. `prisma-client-js` üretici (ESM üreticinin CJS paketleme sorunu PestShield'de yaşandı) |
| Doğrulama | Zod | 4.x | Server action / API girdi doğrulama |
| Kimlik | Kendi DB oturumu + Argon2id (`@node-rs/argon2`) | — | Bifire'de kanıtlanmış desen; dış bağımlılık yok; RBAC + audit log |
| Görsel | `next/image` (AVIF/WebP), `sharp` | 0.35 | Orijinal bayt-bayt korunur, türevler on-the-fly + önbellek |
| Test | Vitest 5 + Playwright 1.64 (sistem Chrome) | — | Unit + prod build e2e |

**Kütüphane eklenmedi:** shadcn/Radix, Framer Motion, GSAP, Lenis — Sprint 1 bileşenleri native `<dialog>`, CSS geçişleri ve IntersectionObserver ile yeterli; bundle küçük kalır. Gerekirse sonraki sprintlerde gerekçesiyle eklenir.

### URL ve dil stratejisi

- **Türkçe öneksiz** ve **eski URL'ler aynen** korunur: `/urun/<slug>`, `/kategori/<slug>`, `/kategori/<slug>/<n>`, `/sayfa/<slug>`, `/iletisim`, `/upload/<dosya>`.
- Diğer diller önekli + ilk segment çevrili: `/en/product/…`, `/fr/produit/…`, `/ru/produkt/…`, `/ar/product/…` (`src/lib/i18n/routes.ts`).
- `proxy.ts` her isteği tek adımda çözer: eski 301'ler → sondaki `/` → `/tr/…` önek temizliği → segment kanonikleştirme (308) → `/[locale]/…` iç rewrite.
- `app/[locale]` kök layout'u `<html lang dir>` üretir; **sayfalar SSG** (`generateStaticParams`, 252 sayfa). Admin ayrı kök layout (`app/admin`).

### Veri yolu

Sprint 1 katalogu, denetim snapshot'ından (`src/data/source-snapshot/*.json`) okuyan bir `CatalogRepository` üzerinden gelir; Sprint 2'de **aynı arayüzü** uygulayan Prisma deposu devreye girer, sayfalar değişmez. Snapshot verisi doğrulanmamış olduğundan tüm sayfalar `noindex`, JSON-LD'de Offer yok.

### Yayın (Hetzner)

Nginx reverse proxy → `127.0.0.1:3010` (PM2, fork, ayrı `kornne` sistem kullanıcısı, `/srv/kornne/{releases,current,shared}`), Let's Encrypt, staging'de Basic Auth + `noindex`. Ayrıntı: `deployment-staging.md`. **Bu sprintte sunucuya bağlanılmadı, kurulum yapılmadı.**

## Alternatifler

- **İzole Hetzner PostgreSQL**: daha düşük gecikme, yedek/izleme sorumluluğu bizde. Müşteri Neon'u seçti; ileride `DATABASE_URL` değişimi + `prisma migrate deploy` ile taşınabilir.
- **PHP/cPanel**: mevcut barındırmada kalmak — Hetzner kararı verildiği için elendi.
- **Headless SaaS (Shopify vb.)**: Merchant kolaylığı, ama 5 dil + teklif usulü + özel admin ihtiyaçları ve maliyet nedeniyle elendi.

## Sonuçlar / riskler

- Neon pooler'da çok komutlu migrasyonlar sorun çıkarabildiği için (önceki proje deneyimi) migrasyonlar `DIRECT_URL` (pooler'sız) ile çalışır.
- Neon ↔ Hetzner arası ağ gecikmesi: SSG/ISR sayesinde vitrin DB'ye istek başına gitmez; admin ve checkout etkilenir — S11'de ölçülecek.
- Prisma 8 / TS 7 yükseltmeleri ayrı ADR ile.
