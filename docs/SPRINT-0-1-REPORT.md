# Sprint 0 + 1 Birleşik Teslim Raporu

**Tarih:** 22 Ekim 2026 · **Kapsam:** Faz 1 (S0 Denetim/Envanter + S1 Proje temeli/Design system) · **Sonraki faza geçilmedi.**

## 1. Özet

- kornne.com salt-okunur tarandı: **232 sayfa / 5 dil**, **41 TR ürün** (vitrin "40" diyor), 36 EN + 38 FR ayrı ürün kaydı, RU/AR'da ürün yok; **445/451 medya** orijinal haliyle + SHA-256 ile envanterlendi.
- Çalışan Next.js 16 projesi: 5 dil (AR RTL), ana sayfa, kategori (sayfalı), ürün detay, kurumsal/yasal, iletişim, arama, 404; korumalı admin login + RBAC'lı dashboard + 15 modül iskeleti.
- Veri modeli **müşterinin Neon veritabanına** uygulandı (tablolar boş). Yerelde açtığım geçici embedded Postgres, talebiniz üzerine **kapatılıp silindi**.
- Lint, typecheck, 27 unit, 22 e2e, i18n ve build kontrollerinin tamamı geçiyor. Canlı site, DNS, Merchant ve diğer projeler **değiştirilmedi**; commit, push ve deploy **yapılmadı**.

## 2. Sprint 0 — kanıt ve çıktılar

| Çıktı | İçerik |
|---|---|
| `docs/audit/current-site.md` | Platform (Hostinger, PHP 7.2), sayfa/katalog/medya/akış/SEO bulguları |
| `docs/audit/page-inventory.csv` | 232 URL × (dil, tip, HTTP, title, H1, meta, canonical, OG, hreflang, robots, JSON-LD, SHA-256, tarih) |
| `docs/audit/product-inventory.csv` | 115 satır (41 TR + 36 EN + 38 FR): source_url, source_id, sku (boş — doğrulanmadı), stock_code_candidate, locale, title, currency, price, old_price, availability (unknown), verification_status (unverified), captured_at + kategori, görsel, bayraklar |
| `docs/audit/category-listing-inventory.csv` | 596 liste kartı (kategori × sayfa × sıra × fiyat × indirim etiketi) |
| `docs/audit/locale-product-mapping.csv` | TR↔EN↔FR önerilen eşleme + fiyat tutarlılığı (11 çelişki) |
| `docs/audit/media-inventory.csv` | 451 medya: kullanım yeri, alt, HTTP, bayt, SHA-256, en/boy, format, 500 px kontrolü, yinelenen |
| `docs/audit/redirect-map.csv` | Her eski URL'nin akıbeti: 130 × 301, 55 × aynı yol, 45 × sonraki sprintte aynı yol, 4 × n/a |
| `docs/audit/data-quality.md` | Doğrulama kuyruğu (sahte 5/5, %0/negatif indirim, dil bazlı fiyat çelişkisi, sıfır IBAN, 3 farklı satıcı kimliği…) |
| `docs/audit/merchant-readiness.md` | Korunacak kimlikler, gereken salt-okunur erişim, alan uygunluğu, Merchant API kararı |
| `docs/audit/open-questions.md` | Eksik erişimler + müşteriye 15 soru |
| Ham veri | `data/source-crawl/` (log + HTML), `data/source-media/originals/` (106,6 MB), betikler `scripts/audit/*` |

**Keşfedilen gerçek ürün sayısı:** TR'de 41 benzersiz ürün. Vitrinin "40" demesinin nedeni: #208 *İkizray Kurban Kancası* yalnızca Kurban kategorisinde listeleniyor. EN'de 36, FR'de 38 kayıt var; RU ve AR'da ürün yok. Bu sayılar **yalnız kamuya açık vitrine** dayanıyor; yayında olmayan veya gizli ürünler yönetim paneli ya da veritabanı erişimi olmadan bilinemez.

## 3. Sprint 1 — teslim edilenler

### Uygulama (çalışır)

| Alan | Dosyalar |
|---|---|
| Rotalar (SSG, 252 sayfa) | `src/app/[locale]/{page, kategori/[slug], kategori/[slug]/[page], urun/[slug], sayfa/[slug], iletisim, arama, [...rest], not-found, error}`, `src/app/global-not-found.tsx` |
| Admin | `src/app/admin/{layout, login/*, (panel)/{layout, page, [module], loading, error}}`, `src/components/admin/*` |
| Proxy | `src/proxy.ts` — dil rewrite, 125 eski 301, tek adımlı kanonikleştirme (308), staging Basic Auth, X-Robots-Tag, admin kapısı |
| i18n | `src/lib/i18n/*` — TR/EN/FR/RU/AR sözlükleri (tam), `missingKeys`, segment çevirisi, hreflang |
| SEO | `src/lib/seo/*` — metadata/canonical/hreflang/OG, güvenli JSON-LD (Organization, WebSite+SearchAction, Breadcrumb, Product; Offer yalnız doğrulanmış fiyatla), `robots.ts`, `sitemap.ts` (görsel + hreflang; indekslenebilir olana dek boş) |
| Katalog | `src/lib/catalog/*` — `CatalogRepository` arayüzü + snapshot uygulaması, sanitizer, sayfalama |
| Güvenlik/Auth | `src/lib/auth/*`, `rate-limit.ts`, `request-meta.ts`, `audit-log.ts`, `next.config.ts` başlıkları |
| Para | `src/lib/money.ts` (kuruş BigInt, TR/Intl biçim, gerçek indirim kontrolü) |
| Veri | `prisma/schema.prisma` (27 model), `prisma/migrations/20261021212815_init` |
| Health | `GET /api/health` → `{"status":"ok","db":"ok"}` (Neon'a karşı doğrulandı) |
| Design system | `src/app/globals.css`, `src/components/{ui,layout,catalog}/*` — `docs/design/design-system.md` |
| Deploy taslakları | `deploy/ecosystem.config.cjs`, `deploy/nginx/kornne-staging.conf.example`, `deploy/nginx/snippets/kornne-proxy.conf`, `deploy/smoke-test.sh` |
| Testler | `tests/unit/*` (5 dosya, 27 test), `tests/e2e/*` (22 test), `vitest.config.mts`, `playwright.config.ts` |

### Dokümanlar

`docs/architecture/{ADR-001-stack-and-hetzner, data-model, deployment-staging}.md`, `docs/design/{design-system, component-reuse}.md`, `docs/SPRINTS.md`, bu rapor, `README.md`.

### Kullanılan componentler

Ayrıntılı kaynak yolu ve uyarlama gerekçesi `docs/design/component-reuse.md` belgesinde. Kısaca:

- **Mezbaha-Teknolojileri'nden:** i18n config/routes/alternates/dictionaries, metadata, JSON-LD deseni, galeri, ürün kartı yapısı, dil seçici, WhatsApp link, PM2/Nginx deseni.
- **Bifire'den:** auth, login action, rate limit, admin shell, tablo, reveal, breadcrumb, native dialog, güvenlik başlıkları.
- **BiciriklarKids'ten:** mega menü etkileşimi ve toast.
- **Kliniva-AI'dan:** Vitest/Playwright yapılandırması.
- **cleanservisi'nden:** health endpoint.

21st.dev/shadcn kökenli parçalar ve başka müşteri markaları **alınmadı**.

## 4. Test sonuçları (22.10.2026, son çalıştırma)

| Kontrol | Komut | Sonuç |
|---|---|---|
| Lint | `npm run lint` | 0 hata, 0 uyarı |
| Typecheck | `npm run typecheck` (`next typegen && tsc`) | temiz |
| Unit | `npm test` | **27/27** (para, rota round-trip, redirect zincir/döngü yok, sözlük tamlığı, JSON-LD kaçışı, sanitizer, katalog sayıları) |
| i18n | `npx tsx scripts/i18n-check.ts` | 4 dil tam |
| Prisma | `prisma validate`, `migrate status` | geçerli; Neon şeması güncel |
| Build | `npm run build` | başarılı, 252 statik sayfa |
| E2E | `npm run test:e2e` (prod build, Chrome) | **22/22**: 12 sayfada 320/768/1440 px'te yatay taşma yok; AR RTL + sağdan açılan çekmece; çevirisi olmayan sayfa noindex ve hreflang'siz; galeri lightbox Esc; mega menü Esc + odak dönüşü; tek adımlı 301/308; gerçek 404; staging noindex; admin koruması; hatalı şifre mesajı; gerçek admin oturumuyla dashboard + çıkış |
| Lighthouse (mobil, yerel `next start`, CDN/sıkıştırma yok) | Lighthouse 13.5 | Ana sayfa: Perf 87 · A11y 100 · BP 100 · SEO 69\* — Ürün: 79/100/100/69\* — AR: 74/100/100/69\* · CLS ≈ 0, LCP 4,0–6,1 sn (simüle 4G) |

\* SEO 69'un tek sebebi bilinçli `noindex`: staging'de `is-crawlable` denetimi kalıyor. Performans hedefi (100) **henüz karşılanmadı**. Sprint 8 ve 11'de ele alınacak işler: Nginx'te gzip/brotli, görsel CDN/önbellek, Arapça font alt kümesi, LCP görsel boyutları.

Test sırasında Neon'da geçici bir admin (rastgele e-posta ve şifre) oluşturuldu ve silindi. Son durumda Neon'da **0 kullanıcı, 0 oturum, 0 log, 0 deneme kaydı** var.

**Ekran URL'leri:** Staging henüz yok; sayfalar yalnız yerelde `npm run start` ile `http://localhost:3460` adresinde açılıyor. Ekran görüntüleri `data/qa/*.png` altında.

## 5. Erişilemeyen alanlar

Ayrıntı: `open-questions.md`.

- kornne.com yönetim paneli ve veritabanı, Hostinger hesabı.
- Merchant Center, Search Console, GA4, Google Ads, DNS.
- **Hetzner VPS:** yerelde iki bilinen SSH hedefi var ama hangisinin KORNNE'ye ayrıldığı belirtilmediği için hiçbirine bağlanılmadı. Sunucu denetimi (nginx -T, pm2 list, portlar, disk/RAM) yapılmadı.
- Varyant fiyatları (#107): AJAX sepet uç noktasına istek atılmadı.
- Ürün teknik föyleri, PDF'ler, vektör logo: kaynakta yok.

## 6. Riskler

| Risk | Etki | Önlem / durum |
|---|---|---|
| Eski veri güvenilmez: 11 dil bazlı fiyat çelişkisi, geçersiz indirimler, sahte puanlar | Merchant reddi, yanıltıcı fiyat | Tek fiyat kaynağı TR, indirim yalnız gerçekse, rating yok; müşteri onayı (S2) |
| Satıcı kimliği belirsiz (3 farklı unvan) | Yasal uyumsuzluk | Yasal sayfalar noindex + uyarı; hukuk onayı (S7) |
| Hostinger → Hetzner göçü (MX/e-posta dahil) | E-posta kesintisi | DNS envanteri (S11 öncesi) |
| RU/AR'da ürün içeriği yok | Bu dillerde SEO değeri yok | Sayfalar var ama noindex + görünür uyarı; çeviri iş akışı (S7) |
| Neon bağlantı dizgesi yazışmada paylaşıldı | Kimlik bilgisi sızıntısı | Şifre rotasyonu + sınırlı uygulama rolü önerildi |
| Neon (Frankfurt) ↔ Hetzner gecikmesi | Admin/checkout yavaşlığı | SSG/ISR; S11'de ölçüm |
| Performans < 100 | CWV hedefi | S8/S11 |
| `KORNNE/` klasörü üst repoda (PestShield) izlenmeyen dizin | Yanlışlıkla `git add .` | `.gitignore` sırları ve medyayı dışlıyor; ayrı repo açılması önerilir |

## 7. Sprint 2 + 3 için hazır olma durumu

**Hazır olanlar:**
- Şema Neon'da.
- `CatalogRepository` arayüzü (Prisma uygulaması takılacak).
- Snapshot ve medya envanteri importer için girdi olarak hazır.
- 301 haritası `Redirect` tablosuna yüklenmeye hazır.

**Önce gerekenler (bloklayıcı):**
1. EN/FR eşlemesi ve fiyat çelişkileri için müşteri onayı.
2. Mümkünse eski sitenin veritabanı dökümü (gizli ürün/varyant/stok verisi için).
3. Medya depolama kararı (yerel disk mi, Hetzner Object Storage mı).
4. Staging alan adı ve hangi Hetzner sunucusunun kullanılacağı.

Sonraki talimatınızı bekliyorum.
