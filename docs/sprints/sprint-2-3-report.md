# Sprint 2 + 3 Birleşik Rapor

**Tarih:** 22 Ekim 2026 · **Çalışma alanı:** `D:\Projects\kornne` (bağımsız Git deposu, commit yok) · **Sprint 4'e geçilmedi.**

## 0. Ön görev — depo izolasyonu ✅

- KORNNE, PestShield deposundan (`üst depo (PestShield)`) **`D:\Projects\kornne`** dizinine kopyalandı.
- Kopya SHA-256 ile doğrulandı: 1296/1296 dosya aynı; 445 orijinal ve 445 sunulan medya; `.env` dahil.
- Ardından `git init` yapıldı; commit ve push yok. `.gitignore` sıkılaştırıldı.
- PestShield'de yalnız Sprint 1'de eklediğim `launch.json` girdisi geri alındı. Eski klasör silinmedi.
- Ayrıntı: `docs/architecture/repository-isolation.md`.

## 1. Sprint 2 — veri aktarımı ✅

| | Sonuç |
|---|---|
| Hedef DB | Neon proje `solitary-surf-70416930`, branch `br-red-water-b9p4hqhg`, endpoint `ep-silent-dew-b9g275pf`, DB `neondb` (PG 18.6). Boş, projeye özel, üzerinde canlı uygulama yok. Bu yüzden geliştirme DB'si kabul edildi. Ayrı branch açılamadı, çünkü Neon API erişimi yok. |
| Şema | Ek migration `20261022000100_sprint2_import`. Yalnız ekleme yapıyor: PriceStatus, MatchStatus, ImportRun, LegacyMatchSuggestion, ham fiyat alanları, kaynak anahtarları, checksum'lar. SQL `migrate diff --from-config-datasource` ile salt-okunur üretildi, `migrate deploy` ile uygulandı. Reset/shadow kullanılmadı. |
| Importer | `npm run import:legacy`: varsayılan dry-run; `--apply --confirm-db=<endpoint>`; tek transaction; manuel düzenleme koruması; rollback betiği. |
| Aktarılan | 41 ürün (40 görünür, #208 incelemede) · 41 TR çeviri · 4 kategori + 20 kategori çevirisi · 79 ürün-kategori · **445 medya** · 118 ürün-görsel · 114 alt metin taslağı · 2 varyant · 41 fiyat (**hepsi UNVERIFIED**) · 41 stok (UNKNOWN) · **594 köken kaydı** (41 TR + 36 EN + 38 FR ürün, 20 kategori, 8 sayfa, 451 medya) · 74 EN/FR eşleşme önerisi · 125 yönlendirme |
| İdempotency | 2. dry-run ve 2. apply: **0 create, 0 update, 1743 unchanged** |
| Bütünlük | Yinelenen anahtar 0, mojibake 0, NFC dışı metin 0, Arapça kategori adları 4/4 geçerli, medya SHA-256 445/445 eşit |

**Sorunlu veriler** (`docs/data-migration/data-quality-issues.md`):

- 11 üründe dil bazlı fiyat çelişkisi
- 6 hatalı indirim
- 6 kırık medya
- 1 incelemede tutulan ürün (#208)
- 8 düşük güvenli eşleşme (özellikle #80 ↔ EN #142 / FR #179 şüpheli)

**Belgelenen çelişki:** Sprint 2 dokümanı #208 için "vitrine çıkmayan" diyor. Tarama kanıtına göre ürün kendi URL'sinde ve Kurban kategorisinin 2. sayfasında görünüyordu; yalnız "Tüm Ürünler" listesinde yoktu. Ürün yine de incelemede tutuldu.

## 2. Sprint 3 — gerçek veriyle vitrin ✅

- **Veri kaynağı Neon.** Tüm görünür katalog tek sorgu turunda okunuyor (60 sn bellek önbelleği). Sayfalar SSG + ISR 300 sn, toplam 102 statik sayfa.
- **Fiyat güvenliği:**
  - Doğrulanmamış fiyat müşteriye gösterilmiyor; ürün sayfasında "Fiyat teklif ile verilir" kutusu var (WhatsApp / e-posta / telefon).
  - Kartlarda "Fiyat için teklif alın" yazıyor.
  - `Offer`, rating, sepet ve Merchant feed yok.
- **Sayfalar:**
  - Yeni ana sayfa: gerçek sayılar, kategori kartları, "Kesim hattı makineleri" ve "Hijyen ve kasap ekipmanları" vitrinleri, teklif süreci.
  - Kategori sayfası: eski URL'ler aynı, sayfalama `/kategori/x/2`.
  - Liste içi arama, kategori filtresi ve sıralama. URL tabanlı, paylaşılabilir; kanonik temel listede kalıyor; robots bu parametreleri dışarıda tutuyor.
  - Arama: aksan duyarsız; boş sonuçta öneri gösteriyor.
  - Ürün detayı, kurumsal/iletişim/404, mega menü, mobil çekmece.
- **Diller:**
  - TR'de 40 ürün sayfası var.
  - EN/FR ürün sayfası yalnız admin eşleşmeyi onaylayınca üretiliyor. Onay öncesi listeler TR içeriği "TR" rozetiyle gösteriyor ve TR sayfasına bağlanıyor.
  - RU/AR ürün sayfası üretilmiyor.
  - hreflang yalnız gerçek sayfalara veriliyor.
  - AR RTL test edildi.
- **Görünürlük:** Kategori sayıları görünür kayıtlardan hesaplanıyor (37 / 15 / 26 / 40). #208'in eski URL'si 307 ile kategorisine gidiyor.
- **Yönlendirmeler:**
  - 125 eski URL DB'den okunuyor (statik JSON yedekte); hepsi tek adım ve hedef 200, otomatik test edildi.
  - Eski EN/FR ürün URL'leri onaya kadar o dilin "tüm ürünler" listesine gidiyor.
- **Medya:**
  - Eski `/upload/...` yolları aynı ve bayt-bayt aynı dosyayı veriyor.
  - Özel karakterli adlar için güvenli yedek route eklendi.
  - Kaynakta kırık 6 URL dürüstçe 404 dönüyor.
  - Next Image ile AVIF/WebP ve `srcset` üretiliyor; kırpma yok.
- **Admin › Katalog QA:**
  - Gösterilenler: dil bazlı sayılar (41 / 36 / 38 / 0 / 0), görünür ve gizli ürünler, doğrulanmış fiyat 0/41, kırık medya, fiyat çelişkileri, hatalı indirimler, eşleşme önerileri ve son import çalıştırmaları.
  - Eşleşme **onay/red** aksiyonları RBAC kontrollü, audit log'lu ve önbelleği yeniliyor.
  - Tam ürün CRUD, sipariş ve Merchant ekranları bu kapsamda **yapılmadı** (Sprint 6/7/9).

## 3. Kullanılan / uyarlanan bileşenler

Mevcut Sprint 1 seti genişletildi; yeni dış bağımlılık eklenmedi.

- **Liste kontrolleri:** URL'yi durum olarak kullanma ve Esc/odak davranışı BiciriklarKids `DesktopNav` desenine dayanıyor; RTL için logical spacing kullanıldı.
- **Admin tabloları/kartları:** Bifire `admin/ui` desenleri.
- **Native dialog:** Bifire.
- **i18n / SEO yardımcıları:** Mezbaha'dan uyarlandı.
- **Test yapılandırması:** Kliniva-AI.

Ayrıntı `docs/design/component-reuse.md` dosyasında.

## 4. Testler

Ayrıntı `docs/qa/sprint-2-3-test-results.md` dosyasında.

| Kontrol | Sonuç |
|---|---|
| Lint | 0 |
| Typecheck | temiz |
| i18n | 4 dil tam |
| Unit + entegrasyon (Vitest) | **44/44** |
| Build | 102 sayfa |
| Playwright | **37/37** |
| Import idempotency | 0 değişiklik |
| Medya hash | 445/445 |

## 5. Mobil performans

Lighthouse 13.5, mobil simülasyon:

| Sayfa | Perf |
|---|---:|
| Ana sayfa | 83 |
| Kategori | 82 |
| Ürün | 84 |
| AR | 80 |
| Arama | 85 |

- Erişilebilirlik ve Best Practices her sayfada 100. SEO 69, bilinçli `noindex` yüzünden.
- LCP 3,7–4,9 sn (simüle). Gözlenen LCP 1,26 sn. CLS 0.
- **90+ hedefi karşılanmadı**; nedenler ve kalan işler test raporunda.

## 6. Kalan engeller

Ayrıntı `docs/next-steps/sprint-4-5-readiness.md` dosyasında. Başlıcaları:

- Şirket unvanı
- KDV
- Aktif fiyatlar
- Ödeme ve IBAN
- Dil eşleşmesi onayı
- Hostinger admin/DB export
- Staging alan adı ve VPS seçimi
- Merchant erişimi
- **Neon şifresinin yenilenmesi.** Şifre yazışmada açıkça paylaşıldı; panelden yenilenmeli ve uygulama için sınırlı bir rol açılmalı.

## 7. Yapılmayanlar (kurallar gereği)

- Commit ve push yapılmadı.
- Deploy yapılmadı; staging de kurulmadı.
- kornne.com, Hostinger, DNS, Merchant, Search Console, Ads, GA4 ve diğer Hetzner projelerine dokunulmadı.
- Neon'da reset, drop veya truncate yapılmadı. Testlerin oluşturduğu geçici kayıtlar test sonunda silindi; son durumda User/Session/AuditLog/LoginAttempt = 0.
- Sahte fiyat, stok, yorum, çeviri, teknik özellik veya görsel üretilmedi.
