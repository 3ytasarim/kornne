# Component Reuse Manifest

Önceki projeler **gerçekten açılarak** incelendi (salt-okunur; hiçbir dosya değiştirilmedi, `.env` okunmadı). Projelerin kök dizininde LICENSE dosyası yok; aşağıdakiler ekibimizin kendi kodudur. 21st.dev / shadcn kökenli dosyalar (Mezbaha `components/ui/flow-button`, `gallery4`…, Bifire `velaris`) **bilinçli olarak alınmadı** (lisans/menşe kontrolü gerekir, bağımlılık getirir). Başka müşterilerin marka adı, metni, görseli veya sırrı kopyalanmadı.

| KORNNE dosyası | Kaynak (mutlak yol) | Ne alındı | Ne değişti / neden | Bağımlılık |
|---|---|---|---|---|
| `src/lib/i18n/config.ts` | `Mezbaha-Teknolojileri/src/lib/i18n/config.ts` | LOCALES / DEFAULT vs CANONICAL ayrımı, RTL_LOCALES, LOCALE_META, `dirOf` | TR öneksiz varsayılan; DE kaldırıldı; LOCALE_PAGES mekanizması gerekmedi | — |
| `src/lib/i18n/routes.ts` | `Mezbaha-Teknolojileri/src/lib/i18n/routes.ts` | İlk segment çevirisi `localizePath` / `resolvePublicPath` | KORNNE eski yolları (`urun/kategori/sayfa`); `/tr` öneki tespiti | — |
| `src/lib/i18n/alternates.ts` | `Mezbaha-Teknolojileri/src/lib/i18n/alternates.ts` | static/entity hreflang | Yalnız gerçek çevirisi olan diller | — |
| `src/lib/i18n/dictionaries/index.ts` | `Mezbaha-Teknolojileri/src/lib/i18n/dictionaries/index.ts` | TR→EN→dil derin birleştirme, `format()` | `missingKeys()` (eksik çeviri görünürlüğü) eklendi | — |
| `src/proxy.ts` | `Mezbaha-Teknolojileri/src/proxy.ts`, `Bifire/src/proxy.ts` | redirect-base, admin çerez kapısı, sondaki `/` yönetimi | Header yerine `[locale]` rewrite (SSG için), tek adımlı kanonikleştirme, staging Basic Auth, X-Robots-Tag; Mezbaha alan adı/DB redirect kaldırıldı | — |
| `src/lib/seo/metadata.ts` | `Mezbaha-Teknolojileri/src/lib/seo/metadata.ts` | canonical + languages + x-default + OG/Twitter | Global indeks kapısı (`SITE_INDEXABLE`), noindex parametresi, Mezbaha OG görseli kaldırıldı | — |
| `src/lib/seo/json-ld.ts` | `Mezbaha-Teknolojileri/src/lib/seo/json-ld.ts` | @id bağlantılı Organization/WebSite/Breadcrumb/Product deseni | **Offer builder yeni**; rating/review hiç yok; güvenli `serializeJsonLd` | — |
| `src/lib/auth/{password,session,guard}.ts` | `Bifire/src/lib/auth/*` | Argon2id (OWASP), DB oturumu (token SHA-256), guard | 8 saat TTL, `sameSite=strict`, `__Host-` çerez (prod), 5 rollü RBAC (`rbac.ts`, yeni) | `@node-rs/argon2` |
| `src/app/admin/login/actions.ts` | `Bifire/src/app/admin/login/actions.ts` | Zod, dummy-hash zamanlama koruması, e-posta + IP kilitleme | DB yoksa dürüst hata, audit log | `zod` |
| `src/lib/rate-limit.ts`, `src/lib/request-meta.ts` | `Bifire/src/lib/rate-limit.ts`, `request-meta.ts` | 5 hata / 15 dk, tuzlu IP hash | Prod'da tuz zorunlu; `X-Real-IP` önceliği | — |
| `src/lib/db.ts` | `Bifire/src/lib/db.ts` | adapter-pg istemcisi, `sslmode=verify-full` | DB yoksa `null` (uygulama çökmesin) | `@prisma/adapter-pg` |
| `src/components/admin/AdminShell.tsx` | `Bifire/src/components/admin/AdminShell.tsx` | Gruplu kenar çubuğu, mobil panel, navigasyonda kapanma | RBAC filtreli menü, KORNNE marka/token'ları, Bifire markası kaldırıldı | `lucide-react` |
| `src/components/ui/DataTable.tsx` | `Bifire/src/components/admin/ui.tsx` (Table) | caption/scope/kaydırma | Genel tip parametreli sütun API'si | — |
| `src/components/ui/RevealObserver.tsx` + reveal CSS | `Bifire/src/components/site/RevealObserver.tsx`, `Bifire/src/app/globals.css` | Birebir (JS + hareket izni varken gizle) | Süre/easing token'ları | — |
| `src/components/catalog/Breadcrumbs.tsx` | `Bifire/src/components/site/Breadcrumbs.tsx` | Görünür breadcrumb = JSON-LD kaynağı | Etiket sözlükten, RTL ok | — |
| `src/components/ui/Dialog.tsx` | `Bifire/src/components/site/Lightbox.tsx` + `admin/ConfirmAction.tsx` | native `<dialog showModal>` kabuğu | Modal/drawer/fullscreen varyantları, logical kenarlar | — |
| `src/components/catalog/ProductGallery.tsx` | `Mezbaha-Teknolojileri/src/components/public/product-gallery.tsx` + `Bifire/…/Lightbox.tsx` | Carousel semantiği, ok tuşları, 2,5× imleç zoom, RTL oklar | Mezbaha'nın `div role=dialog` lightbox'ı (odak tuzağı yok) yerine native dialog; Türkçe sabit metinler sözlüğe | `next/image` |
| `src/components/layout/MegaMenu.tsx` | `BiciriklarKids/src/components/layout/DesktopNav.tsx` | Tıklama + gecikmeli hover, Esc → tetikleyiciye odak, dış tıklama | Logical spacing (BiciriklarKids RTL değildi), ürün görselli panel, FeltArt görselleri yok | — |
| `src/components/layout/LanguageSwitcher.tsx` | `Mezbaha-Teknolojileri/src/components/i18n/language-switcher.tsx` | hreflang'den eşdeğer sayfa, düz `<a>`, Esc/dış tıklama | `useSyncExternalStore`; çevirisi olmayan ama var olan sayfalar için `PageLanguageLinks` | — |
| `src/components/catalog/ProductCard.tsx` | `Mezbaha-Teknolojileri/src/components/public/product-card.tsx` | Ayarlanabilir başlık seviyesi, görsel linki AT'den gizli | 21st.dev `ArrowFillButton` alınmadı; fiyat/indirim mantığı yeni | — |
| `src/components/ui/Toast.tsx` | `BiciriklarKids/src/components/commerce/CommerceProvider.tsx` (notify) | aria-live bildirim deseni | Sepetten ayrıldı, bağımsız provider | — |
| `src/components/layout/WhatsAppCta.tsx` | `Mezbaha-Teknolojileri/src/lib/whatsapp.ts` | wa.me link üretimi | Mesaj dil bazlı | — |
| `src/app/api/health/route.ts` | `cleanservisi/src/app/api/health/route.ts` | `SELECT 1`, iç bilgi yok | DB yapılandırılmamış durumu | — |
| `vitest.config.mts`, `playwright.config.ts` | `Kliniva-AI/vitest.config.mts`, `Kliniva-AI/playwright.config.ts` | `server-only` stub, prod build e2e | Sistem Chrome, trace/video kapalı (şifre artefakt riski) | `vitest`, `@playwright/test` |
| `next.config.ts` güvenlik başlıkları | `Bifire/next.config.ts` | Başlık seti, `htmlLimitedBots` | COOP, CSP alt kümesi, `/upload` önbellek + noindex | — |
| `deploy/ecosystem.config.cjs`, `deploy/nginx/*` | `Mezbaha-Teknolojileri/deploy/*` | PM2 fork + loopback, Nginx upstream/limit_req deseni | Port 3010, `kornne` kullanıcısı, **`default_server` kaldırıldı**, staging Basic Auth | — |

## Değerlendirilip alınmayanlar

| Aday | Neden alınmadı |
|---|---|
| `BiciriklarKids/src/components/ui/Sheet.tsx` (Radix Dialog) | Native `<dialog>` aynı a11y'yi bağımlılıksız sağlıyor |
| `Mezbaha-Teknolojileri/src/components/public/site-header.tsx` | 21st.dev FlowButton/Button3D bağımlılığı, mobil panelde odak tuzağı yok |
| `Kliniva-AI/src/server/security/rate-limit.ts` | Drizzle SQL; Prisma'ya port Sprint 11 güvenlik işinde (atomik upsert) |
| `Kliniva-AI/src/lib/security-headers.ts` (nonce CSP) | Nonce'lu CSP ayrı test gerektiriyor → S11 |
| `Norm-Yacht` shadcn seti | Tailwind 3 + Vite; port maliyeti, gereksiz bağımlılık |
| Zeynep-Metal, ATK-Makina, Baftek, HDM | PHP/cPanel — yığına uymuyor |

## Erişilemeyenler

Tüm aday projelere yerel diskte erişildi. Diğer bilgisayarlardaki veya yalnız uzak repolarda duran bileşenler incelenmedi; kullanılmış gibi gösterilmedi.
