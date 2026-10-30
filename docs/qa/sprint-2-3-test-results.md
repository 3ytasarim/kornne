# Sprint 2+3 Test Sonuçları

**Ortam:** `D:\Projects\kornne`, Windows 11, Node 24.19, Next 16.4.2 production build (`next start`, :3460), sistem Chrome, Neon `ep-silent-dew-b9g275pf` · **Tarih:** 22 Ekim 2026. Ham çıktılar: `data/qa-logs/*` (gitignore).

## Özet (son tam çalıştırma)

| Kontrol | Komut | Sonuç |
|---|---|---|
| Lint | `npm run lint` | **0 hata, 0 uyarı** (exit 0) |
| Typecheck | `npm run typecheck` (`next typegen && tsc --noEmit`) | **temiz** (exit 0) |
| i18n | `npx tsx scripts/i18n-check.ts` | en/fr/ru/ar **complete** |
| Unit + entegrasyon | `npx vitest run` | **7 dosya, 44/44** (Sprint 1'in 27'si + 11 import planı + 6 Neon entegrasyon) |
| Build | `npm run build` | başarılı, **102 statik sayfa** (ISR 300 sn) |
| E2E (Playwright, Chrome) | `npx playwright test` | **37/37 geçti**, 19 atlandı (= `visual.spec.ts`, yalnız `QA_SHOTS=1` ile çalışır) |
| Import idempotency | `npm run import:legacy` | **0 create · 0 update · 1743 unchanged** |
| Medya bütünlüğü | `node scripts/verify-media.mjs` | 445 DB ↔ 445 orijinal ↔ 445 sunulan, **SHA-256 eşit** |
| Kopya bütünlüğü | `node scripts/verify-copy.mjs` | 1296/1296 dosya eşit (evidence/isolation-verify.json) |

## Geliştirme sırasında yakalanıp düzeltilen başarısızlıklar (gizlenmedi)

| Test | Hata | Kök neden → düzeltme |
|---|---|---|
| `legacy /upload URLs…` | `robotıc systems & (600 x 160 piksel).png` → **404** | Next statik sunucusu ham `&` içeren yolu çözemiyor → `src/app/upload/[...path]/route.ts` güvenli yedek route |
| `#208 is held…` | `Location: /kategori/kurban-ekipmanlari, /kategori/kurban-ekipmanlari` (çift başlık) | `redirect()` sayfa + metadata'da iki kez → incelemedeki ürün yönlendirmesi proxy'ye taşındı (tek başlık) |
| `admin Catalog QA: approve…` | Onay sonrası EN sayfası **404**, eski URL eski hedefe | Katalog ve yönlendirme önbelleği ayrı bundle'larda → `invalidateCatalog()` + `globalThis` paylaşımlı redirect memo |
| `import-plan` (unit) | karakter düzeyinde karşılaştıran hatalı assertion | test düzeltildi (dil başına sayım) |
| görsel QA | "Robotik Sistemler" kartında görsel yok | kapak seçimi birincil kategoriye bağlıydı → kategori başına farklı gerçek ürün görseli |
| Sprint 1 testleri | `/en/product/circular-cutting-cell` 200, RU ürün fallback sayfası, EN yönlendirme hedefi | **Davranış değişti (spec gereği):** onaysız EN/FR çeviri sayfası ve RU/AR ürün sayfası üretilmiyor → testler yeni kurala güncellendi |

## E2E kapsamı (37)

- **Responsive / taşma yok** — 13 sayfa × **320 / 375 / 768 / 1024 / 1440 px**: TR ana sayfa, tüm ürünler (s.1, s.2), ürün, kurumsal, iletişim, EN ana sayfa, EN tüm ürünler, FR kategori, RU tüm ürünler, AR ana sayfa, AR tüm ürünler, arama.
- **AR RTL** + mobil çekmecenin sağdan açılması + Esc ile kapanma.
- RU/AR ürün sayfası **404**, listelerde TR fallback (`hreflang="tr"`), RU hreflang yalnız gerçek kategori sayfasına.
- Galeri lightbox (native dialog, Esc); mega menü (Esc + odak dönüşü).
- Tek adımlı yönlendirmeler (5 örnek) + **125 yönlendirmenin tamamı**: her biri tek 301 ve hedef 200.
- Gerçek 404 (eski site 200 dönüyordu); staging `X-Robots-Tag: noindex` + `robots.txt Disallow: /`.
- **Fiyat güvenliği:** ürün sayfasında teklif kutusu, eski fiyat metni yok, `Product` JSON-LD'de `offers` yok, rating/review yok; listelerde "Fiyat için teklif alın", hiçbir `x.xxx,xx TL` metni yok.
- **Görünürlük:** #208 → 307 Kurban kategorisi; listede/aramada yok; sayaçlar 37 / 15 / 26 / 40.
- **Liste:** eski uyumlu sayfalama (s.2 = 16 ürün, `/3` → 301, self-canonical), kategori filtresi (15) + ad sıralaması (TR collation) + temizleme, kanonik filtrelemeden etkilenmez, liste içi arama + boş durum.
- **Arama:** aksan/büyük-küçük harf duyarsız (`dos acma` → Döş Açma), boş sonuçta kategori + öne çıkan öneri, < 2 karakter uyarısı.
- **445 eski görsel URL'si** HTTP üzerinden indirildi → SHA-256 envanterle aynı; 6 kaynak-kırık URL 404.
- **Uçtan uca ürün (#78):** eski yol = yeni yol (200), `lang=tr`, H1 = eski başlık, breadcrumb = eski kategori, ana görsel aynı yolda bayt-bayt aynı, ayrı EN kaydının URL'si tek adımda EN listesine.
- **Admin:** korumalı + noindex, hatalı şifre genel mesaj, gerçek oturumla dashboard + çıkış, **Katalog QA'da EN #140 onayı → `/en/product/circular-cutting-cell` 200 + eski URL yeni sayfaya**; test sonunda onayın yaptığı her değişiklik geri alınır (çeviri, alt metinler, yönlendirme, köken durumu, öneri durumu, audit satırı). Geçici admin rastgele e-posta/şifreyle açılıp silinir.

Son durumda Neon'da test kalıntısı yok: `User 0, Session 0, AuditLog 0, LoginAttempt 0`, öneri #140 `SUGGESTED`, TR dışı çeviri 0.

## Mobil performans (Lighthouse 13.5.0, mobil, simüle 4G + 4× CPU, yerel `next start`)

`node scripts/qa/lighthouse.mjs <lighthouse-cli>` → `docs/qa/lighthouse/*.json`

| Sayfa | Perf | A11y | BP | SEO* | LCP | FCP | CLS | TBT |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Ana sayfa | 83 | 100 | 100 | 69 | 3,7 s | 1,0 s | 0 | 290 ms |
| Tüm ürünler | 82 | 100 | 100 | 69 | 4,3 s | 1,0 s | 0 | 200 ms |
| Ürün | 84 | 100 | 100 | 69 | 4,0 s | 1,0 s | 0 | 200 ms |
| AR ana sayfa | 80 | 100 | 100 | 69 | 4,9 s | 2,0 s | 0 | 40 ms |
| Arama | 85 | 100 | 100 | 69 | 3,9 s | 1,0 s | 0 | 190 ms |

\* SEO 69'un tek sebebi bilinçli staging `noindex` (`is-crawlable`).

**Bu sprintteki iyileştirmeler ve ölçülen etkisi:**
- CSS inline (`experimental.inlineCss`): render-blocking denetimi 1,79 sn tasarruf uyarısından **geçti**.
- Font preload azaltıldı: başlık fontu tek ağırlık ve preload yok, kiril alt kümesi isteğe bağlı, Arapça 4 → 2 ağırlık.
- 52 KB logo yerine 64 ve 180 px favicon türevleri kullanıldı.
- Ana sayfa toplam boyutu **895 KB → 622 KB**.
- LCP: ana sayfa 4,1 → 3,7 sn · kategori 4,9 → 4,3 sn · AR 6,2 → 4,9 sn.

Performans skoru Sprint 1'deki 74–87 aralığından **80–85** aralığına geldi. Daha dar bir aralık, ama alt sınır yükseldi. **90+ hedefi karşılanmadı.**

- Aynı sayfanın 3 tekrar ölçümü: 80 / 78 / 82; TBT 240–340 ms arasında oynuyor.
- Gerçek (gözlenen, kısıtlamasız) LCP **1,26 sn**, sunucu TTFB 5–18 ms.
- Simüle 4,2 sn'lik LCP'yi, yavaş ağda 205 KB JS ile hero görselinin aynı bant genişliğini paylaşması belirliyor.

Kalan işler (Sprint 8/11):
- Header'daki mega menü ve mobil çekmeceyi istemci bileşeni olmaktan çıkarıp ihtiyaç anında yüklemek.
- RSC payload'unu küçültmek.
- Nginx'te Brotli ve önbellek, CDN.
- Hero görselini önceden üretilmiş AVIF olarak sunmak.
- Sahada CrUX/INP ölçümü.

INP laboratuvarda ölçülemiyor; TBT dolaylı gösterge olarak kullanıldı.

## Ekran görüntüleri

`docs/qa/screenshots/` (19 adet, `QA_SHOTS=1 npx playwright test tests/e2e/visual.spec.ts`): home-1440/375/320, home-dark-1440, home-ar-375, category-1440/1024/768/375, category-filtered-1440, category-en-1440, product-1440, product-375, search-results-1024, search-empty-375, 404-1440, mobile-drawer-375, megamenu-1440, admin-catalog-qa-1440.
