# KORNNE Design System (Sprint 1)

Kaynak: `src/app/globals.css` (token'lar), `src/components/ui/*`, `src/components/layout/*`, `src/components/catalog/*`.

## Marka temeli — gerçek logodan

Orijinal `upload/Kornne_Logo.png` (500×500) piksel analizi: baskın renk **#293E59** (19.576 px), ikincil **#C9CED5**. Logo tek renk lacivert rozet + slab-serif "KORNNE" yazısı. Logo yeniden çizilmedi; bayt-bayt kopyası `public/brand/kornne-logo.png`.

Plandaki önerinin uygulanışı:

| Öneri | Uygulama | Neden |
|---|---|---|
| Antrasit `#151A20` | `--ink` (metin) | Uyumlu |
| Kırmızı `#C62828` | `--signal` — **yalnız indirim/hata** | Logoda yok; marka rengi olarak kullanmak müşteri onayına bağlı |
| Açık gri `#F4F5F6` | `--surface-2` | Uyumlu |
| İkincil metin `#7A858E` | `--steel` **#5D6773** | #7A858E beyazda 3,8:1 → WCAG AA altı; koyulaştırıldı (5,7:1) |
| — | `--brand-700` **#293E59** + 950–50 rampası, `--silver` #C9CED5 | Logo rengi birincil |

## Token'lar

- **Renk:** brand 950/900/800/700/600/500/300/100/50, silver, ink, ink-2, steel, line, line-strong, surface 1–3, signal(+50), success(+50), warning(+50), whatsapp (#15803D — beyaz metinle 5:1), focus #2F6FDE. `[data-theme="dark"]` aynı adlarla karanlık değerler.
- **Tipografi:** Roboto Slab 600/700 (başlık; logodaki slab harflerle uyum), Inter (gövde; latin-ext + kiril), IBM Plex Sans Arabic (yalnız `ar`, slab yerine). Akışkan ölçek: `text-display` 34→60 px, `text-h1` 28→44, `text-h2` 24→34, `text-h3` 18→22.
- **Boşluk:** Tailwind 4 px tabanı; bileşenler 8 px ızgarada (p-4/5/6/8, gap-3/4/8). `container-site` 1320 px, kenar 16→40 px akışkan.
- **Radius:** sm 6 · md 10 · lg 16 · xl 24. **Gölge:** `shadow-card`, `shadow-pop`.
- **Hareket:** `--ease-out-expo` = `cubic-bezier(0.16,1,0.3,1)`, 200 ms (mikro) / 320 ms (UI) / 800 ms (sayfa/reveal). `prefers-reduced-motion: reduce` → tüm animasyonlar kapalı; `.reveal` yalnız JS + hareket izni varken gizli başlar.
- **Erişilebilirlik:** min. 48 px dokunma hedefi (md/lg buton, ikon butonları `size-12`), `:focus-visible` 3 px odak halkası, skip-link, AA kontrast, `lang/dir` her sayfada.
- **RTL:** yalnız logical utility'ler (`ms/me/ps/pe/start/end`), yön oklarında `rtl:-scale-x-100`, çekmece "start" kenarından açılır (AR'da sağ).

## Bileşenler

| Bileşen | Dosya | Notlar |
|---|---|---|
| Button / ButtonLink / ButtonAnchor | `ui/Button.tsx` | primary, secondary, outline, ghost, whatsapp, danger, light; sm/md/lg |
| Badge | `ui/Badge.tsx` | neutral, brand, signal, success, warning, outline |
| TextField / TextArea / SelectField | `ui/Field.tsx` | label + hint + hata, `aria-invalid`, `aria-describedby`, zorunlu işareti |
| Dialog (modal / drawer-start / drawer-end / fullscreen) | `ui/Dialog.tsx` | native `<dialog showModal>` → odak tuzağı, Esc, inert arka plan; backdrop tıklaması |
| Toast | `ui/Toast.tsx` | `aria-live` bölge, hata = `role=alert`, 5 sn |
| DataTable | `ui/DataTable.tsx` | `<caption>`, `th scope=col`, yatay kaydırma, boş durum |
| EmptyState / ErrorState / Skeleton / ProductGridSkeleton / Notice | `ui/States.tsx` | boş, hata, yükleme durumları |
| RevealObserver | `ui/RevealObserver.tsx` | tek seferlik scroll reveal |
| SiteHeader + MegaMenu + MobileNav + SearchForm + LanguageSwitcher + ThemeToggle | `layout/*` | sticky header, üst bar, mega menü (kategori → ürün görselleri) |
| SiteFooter, WhatsAppFab/whatsappHref, PreviewBanner, PageLanguageLinks | `layout/*` | |
| ProductCard, PriceBlock, ProductGallery, Breadcrumbs, Pagination, CategoryView | `catalog/*` | sahte yıldız yok; indirim yalnız gerçekse; galeri zoom + klavye + kaydırma |
| AdminShell, PageHeader, StatCard | `admin/*` | RBAC'a göre filtreli menü |

## Durumlar

Her liste: boş (EmptyState), hata (`error.tsx` + ErrorState), yükleme (admin `loading.tsx` skeleton). Public tarafta `loading.tsx` bilinçli olarak yok (streaming başlarsa `notFound()` 200 döner — Bifire'de yaşandı).

## Görsel QA

`data/qa/*.png` (gitignore): masaüstü/mobil ana sayfa, AR mobil, karanlık mod, mega menü, kategori, ürün (TR + RU çeviri eksik uyarısı), iletişim, 404, admin girişi.
