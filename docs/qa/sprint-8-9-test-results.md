# Sprint 8 + 9 — test sonuçları

**Tarih:** 22–23.10.2026. **Ortam:** Windows 11, Node 24.19, sistem Chrome, Lighthouse 13.5.0.

- **İzolasyon:** yazan hiçbir test Neon'a dokunmaz.
  - Entegrasyon testleri yerel `kornne_it` veritabanına yazar.
  - E2E testleri Neon'un salt-okunur kopyası olan yerel `kornne_e2e` veritabanına yazar (embedded PostgreSQL 18, 127.0.0.1:54391).
  - Neon'a yalnız `default_transaction_read_only=on` oturumuyla okuma yapılır.
- **Fail-closed:** `tests/test-db-url.mjs` yerel olmayan veya yanlış port/DB hedefini reddeder (REFUSED). Yerel sunucu yoksa testler "SKIPPED — ISOLATION UNAVAILABLE" der.

## Özet

| Kontrol | Komut | Sonuç |
|---|---|---|
| Lint | `npx eslint .` | ✅ 0 hata, 0 uyarı |
| Typecheck | `npm run typecheck` | ✅ |
| i18n anahtar eşliği (5 dil) | `npm run i18n:check` | ✅ en/fr/ru/ar complete |
| Prisma ↔ Neon | `prisma migrate status` / `migrate deploy` | ✅ 5 migration; yeni additive migration uygulandı (rapor §3) |
| Unit + entegrasyon | `npx vitest run` | ✅ **188/188**, 17 dosya. Önceki 121 korunuyor. **+67:** 19 SEO denetim/görsel/GEO, 40 Merchant (readiness, feed, adaptör, mock, eşleme, RBAC), 5 izole entegrasyon (readiness → READY, MOCK senkron, eşleme, SEO kaydı), 3 Neon salt-okunur (0/40 READY, görsel sayıları, envanter) |
| Production build | `next build` ×2 (`.next` + `.next-prodlike`) | ✅ |
| Playwright E2E | `npm run test:e2e` | ✅ **82/82**. Önceki 63 korunuyor; 1'i Sprint 8 dil politikasına göre güncellendi: RU kategori artık hreflang'sız ve noindex. **+19 yeni:** 11 chrome + 8 prodlike. 36 test atlandı: ekran görüntüsü üreticileri (`QA_SHOTS=1`). Tam koşu ≈ 3 dk |
| Ekran görüntüleri | `QA_SHOTS=1 node scripts/test-db/e2e.mjs --no-build tests/e2e/visual89.spec.ts` | ✅ **16 görüntü** (`docs/qa/screenshots/s89-*`) |
| SEO denetimi | `scripts/seo/audit.ts` dev / prodlike | ✅ 263 URL, 0 hata, 4 uyarı (her iki modda) |
| Görsel denetimi | `scripts/seo/image-audit.ts --db=neon` | ✅ 445/445 hash, 6 kırık rapor edildi |
| Medya bütünlüğü | `node scripts/verify-media.mjs` | ✅ 445/445 (orijinal + sunulan) |
| Bağımlılık açığı | `npm audit --omit=dev` | ✅ 0 açık |
| Neon artık kaydı | `node scripts/qa/s67-residue.mjs` | ✅ Sprint başı = sprint sonu (fark yok) |

## Yeni E2E senaryoları

| Spec | Senaryo |
|---|---|
| `sprint89` | noindex ortamı: robots `Disallow: /`, sitemap boş, sayfa ve görsellerde `X-Robots-Tag` |
| `sprint89` | SEO QA klavye ile (Enter) çalıştırılır → 0 hata. Tablo ve filtre çalışır; CSV'de PII yok |
| `sprint89` | Görsel SEO: 6 kırık görsel listelenir, 445 dosya doğrulanır. GEO sayfası yalnız kanıtlı öneri gösterir |
| `sprint89` | Merchant panosu: 0/40, BAĞLI DEĞİL · GÖNDERİLMEDİ. Feed'de 40 hariç ürün; XML'de `<item>` yok, noindex |
| `sprint89` | SİMÜLASYON → `NOT_SENT`, MOCK → `MOCK_OK`. Eşleme önizlemesi `MerchantItemMapping` tablosuna yazmaz |
| `sprint89` | RBAC: SEO editörü Merchant ekranına giremez, feed dışa aktarımı 403 döner. Admin formu SEO editörü olarak yeniden oynatılınca reddedilir, kayıt oluşmaz, `auth.denied` loglanır |
| `sprint89` | Sipariş operatörü SEO CSV'sine erişince 403, anonim istek yönlendirilir |
| `sprint89` | 320 / 768 / 1440 px: 7 admin ekranında yatay taşma yok |
| `sprint89` | TR/EN/FR/RU/AR: `lang`/`dir` (AR rtl), tek H1, 320 px'te taşma yok |
| `seo.prodlike` | robots (Allow, admin ve arama kapalı, kendi sitemap'i) |
| `seo.prodlike` | sitemap: her URL için 200 + index + self-canonical, gerçek lastmod, admin/arama/sepet yok, onaysız dil yok |
| `seo.prodlike` | ürün: index, self-canonical, Product var, Offer/rating/price yok, hreflang yok, Organization'da `legalName` yok |
| `seo.prodlike` | kategori: CollectionPage. EN noindex ve hreflang'sız. Filtreli adres canonical olarak temel listeye gider |
| `seo.prodlike` | arama, sepet, ödeme, teklif listesi ve iletişim üretimde de noindex |
| `seo.prodlike` | çevirisiz ürün adresi EN/RU/AR'de 404 |
| `seo.prodlike` | **125 eski yönlendirme:** her biri tek 301 adımıyla 200 sayfaya gider; #208 için 307 |
| `seo.prodlike` | **445 görsel** eski yolunda bayt-bayt aynı. 6 kırık görsel 404. Uzantı/biçim uyuşmazlığı yalnız 1 yetim dosyada |

## Tarayıcı kapsamı
- **Test edilen:** yalnız sistem Chrome (Playwright `channel: "chrome"`, Desktop Chrome cihaz profili ve 320/375/768/1440 genişlikleri).
- **Test edilmeyen:** Firefox ve Safari/WebKit. Bu ortamda tarayıcı indirmesi yapılmadı. Sprint 11 QA matrisine bırakıldı.

## Lighthouse (mobil, simüle ağ kısıtlaması, 3 koşu ortancası)
Ayrıntı: `docs/qa/lighthouse-s89/summary.json`.

- **Ortam:** yerel `next start` (:3470), noindex ortamı.
- **Ölçüm dışı tutulanlar:** üretim ayarı (index) açılmadı. SEO puanı **69** ve tek başarısız denetim `is-crawlable` (bilinçli noindex). Diğer tüm SEO denetimleri geçti.
- **Koşu sağlığı:** 18 koşu; 0 geçersiz. 18 koşunun hepsinde rapor yazıldıktan sonra Windows Chrome geçici klasör temizliği hatası (EPERM) alındı. Betik artık geçerli JSON'u sayıyor ve bu hatayı ayrıca raporluyor.

| Sayfa | S6/7 sonu | S8 bazal | **S8+9 son** (3 koşu) | LCP | FCP | CLS | TBT | Erişilebilirlik / En iyi uyg. |
|---|---:|---:|---|---|---|---|---|---|
| Ana | 86 | 86 | **89** (89/89/89) | 3,8 sn | 1,2 sn | 0 | 40 ms | 100 / 100 |
| Kategori | 86 | 85 | **88** (88/88/89) | 3,9 sn | 1,1 sn | 0 | 70 ms | 100 / 100 |
| Ürün | 88 | 87 | **88** (88/88/89) | 3,8 sn | 1,1 sn | 0 | 30 ms | 100 / 100 |
| Arapça ana | 87 | 88 | **83** (83/83/84) ⚠ | 4,2 sn | 2,1 sn | 0 | 80 ms | 100 / 100 |
| Arama | 77 | 88 | **90** (89/90/90) | 3,6 sn | 1,1 sn | 0 | 30 ms | 100 / 100 |
| Teklif listesi | 89 | 89 | **91** (91/91/91) | 3,5 sn | 1,1 sn | 0,029 | 60 ms | 100 / 100 |

**Yapılan iyileştirme:** Inter (gövde fontu) önyüklendi.

- LCP öğesi artık ana sayfa paragrafı, yani metin. FCP 2,1 → 1,1 sn düştü.
- Ana sayfa 86→89, kategori 85→88, arama ve teklif ≥ 90.
- **Bilinen gerileme:** Arapça 88→83. Next, layout'taki önyüklemeli fontları her dilde ekliyor; Arapça LCP metni ise IBM Plex Arabic ile çiziliyor. Dile göre önyükleme denendi: her iki dilde 4 font önyüklendi, sonuç daha kötüydü ve geri alındı. Çözüm dile özgü layout gerektiriyor (Sprint 11 önerisi).

**LCP ≈ 3,5–3,9 sn:** simüle "slow 4G" üzerinde ölçüldü.

- Kalan darboğaz: 14 KB render-blocking CSS (tahmini kazanç 460 ms) ve ilk JS paketi (72 KB, %39'u kullanılmıyor).
- `inlineCss` Sprint 4/5'te ölçüldü ve daha kötüydü.
- Sonraki adım Hetzner üzerinde HTTP/2 + Brotli ile gerçek ağ ölçümü ve CrUX verisi.

**INP:** laboratuvarda ölçülemez; vekil metrik TBT 30–80 ms.

## Bilinen sınırlar
- Rich Results Test, Search Console ve Merchant teşhisi çalıştırılmadı (erişim yok, canlı alan adı yok).
- Merchant API gerçek uç noktası test edilmedi. Yalnız MOCK istemciyle ve sahte `fetch` ile URL/başlık doğrulaması yapıldı.
