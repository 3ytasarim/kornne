# Sprint 13 — Çok dilli site: varsayılan EN, + Almanca, tam çeviriler

Tarih: 10.11.2026 · Talep: "Çok dilli olacaktı site aynı mezbahateknolojileri gibi açılış dil EN olacak TR, FR, DE,
Arapça, Rusça da Language olarak eklenecek, çeviriler sende, menüye switcher".

## Yapılanlar
- **Varsayılan dil İngilizce**: `kornne.com/` İngilizce açılır, İngilizce adreslerin öneki yok (`/product/x`, `/category/x`).
- **Türkçe `/tr/` altında**: `/tr/urun/x`, `/tr/kategori/x`, `/tr/sayfa/x`…
- **Eski Türkçe adresler korunur**: `/urun/x`, `/kategori/x`, `/sayfa/x` gibi eski (öneksiz) Türkçe adresler **tek adımda 301**
  ile `/tr/...` karşılığına gider (`legacyTurkishPath`, src/lib/i18n/routes.ts).
- **125 eski site yönlendirmesi** veritabanında değiştirilmedi; hedefleri çalışma anında yeni şemaya çevrilir (bare Türkçe →
  `/tr/...`, `/en/...` → öneksiz), yine tek adım (`canonicalRedirectTarget`).
- **Almanca (DE) eklendi**: arayüz sözlükleri (`dictionaries/de.ts`, `shop/de.ts`), adres segmentleri (`/de/produkt/…`,
  `/de/kategorie/…`, `/de/seite/…`, `/de/kontakt`…), bayrak, veritabanı `Locale` değeri (migration `20261110090000_locale_de`).
- **Dil sırası**: EN, TR, DE, FR, RU, AR (Arapça sağdan sola).
- **Dil seçici ana menüde**: bayraklı açılır menü (masaüstü + tablet), mobil menüde bayraklı liste. Her dil, bulunduğunuz
  sayfanın o dildeki karşılığına gider (yoksa o dilin ana sayfası).
- **Çeviriler** (`data/translations/<dil>.json`, Türkçe kaynaktan): 41 ürün (ad, adres, açıklama, SEO başlık/açıklama),
  4 kategori (SEO + Almanca adlar), Kurumsal sayfa (eski EN/FR/RU/AR sürümleri boştu → dolduruldu; DE yeni), menü etiketleri.
  Yasal metinler hukuki onay beklediği için yalnız Türkçe (diğer dillerde Türkçe metne bağlantı).
- **SEO**: tüm diller varsayılan olarak indekslenebilir; hreflang 6 dil arasında karşılıklı, `x-default` = İngilizce.
  robots.txt her dilin arama sayfasını dışarıda tutar.
- **Admin**: ürün seçenek editörüne DE alanı; içerik/medya/ürün dil listeleri tek kaynaktan (`LOCALES`).
- **Güvenlik/sağlamlık**: ürün/sayfa adresi değişince eski biçimdeki (`/urun/x`) yönlendirmeler de yeni adrese yönlenir
  (`pathVariants`); veritabanı bağlantı havuzu süreç başına 5 (6 dilli derleme bağlantı limitini aşmasın, `DB_POOL_MAX`).

## Canlıya geçiş (sırayla)
1. Kodu sunucuya alın (GitHub `main`).
2. Migration (yalnız yeni dil değeri ekler):
   ```
   npx prisma migrate deploy
   ```
3. Çevirileri canlı veritabanına yazın — önce kuru çalıştırma, sonra uygulama:
   ```
   npx tsx scripts/i18n/import-translations.ts --db=neon
   npx tsx scripts/i18n/import-translations.ts --apply --confirm-db=<neon-endpoint-id>
   ```
   Türkçe kayıtlara dokunmaz. Admin'den elle düzenlenmiş bir çeviri varsa korunur (`--overwrite` verilmedikçe).
4. Sunucu `.env`: `SEO_LOCALES` satırını **silin** ya da `SEO_LOCALES=en,tr,de,fr,ru,ar` yapın (önceden `tr` idi; böyle kalırsa
   diğer diller noindex olur).
5. Yeniden derleyin / başlatın. Sonra Admin › SEO'da "Boş SEO alanlarını otomatik doldur" (yeni dillerde boş kalan varsa).
6. Search Console: yeni sitemap'i gönderin; eski `/urun/...` adreslerinin 301 verdiğini birkaç örnekle kontrol edin.

## Bilinmesi gerekenler
- Çeviriler profesyonel ama **ana dili konuşan biri tarafından gözden geçirilmedi** (özellikle AR/RU/DE).
- Yaklaşık 20 üründe Türkçe kaynakta açıklama yok; bu ürünlerin çeviri SEO açıklamaları genel, uydurma özellik içermez.
- Kaynak Türkçe metinlerdeki hatalar (ör. "Kurban Yatırma Kabini" açıklamasında başka ürün metni) çevirilere de taşındı;
  düzeltme Türkçe kaynakta yapılıp çeviri güncellenmeli.
- Eski sitenin İngilizce ürün adresleri (ör. `/urun/bisection-saw`) bugün İngilizce "Tüm ürünler" kategorisine yönleniyor;
  artık İngilizce ürün sayfaları var — ürün bazlı yönlendirme ayrıca yapılabilir (eşleşmeler doğrulanınca).

## Derleme ve testler
- 6 dil ≈ 360 önceden üretilen sayfa: derleme işçi sayısı 4 (`NEXT_BUILD_CPUS`), veritabanı havuzu süreç başına 5
  (`DB_POOL_MAX`). Aksi hâlde derleme bağlantı limitini ve belleği aşıyordu (küçük sunucuda da aynı risk).
- Ana sayfa başlıkları her dilde ≤ 60 karakter (`meta.homeTitle`).
- Vitest 220/220. Playwright: tam tur 178 geçti; kalan 5 hata (Almanca uzun kelime taşması) düzeltildi ve etkilenen
  testler yeniden çalıştırıldı: 108/108. Yerel SEO denetimi: 481 adres, 0 hata.
- Eski "EN eşleşme onayı" uçtan uca testi atlandı (tüm ürünlerin EN çevirisi artık içe aktarılıyor); iş akışı
  `tests/integration/translation-flow.test.ts` ile test ediliyor.

# Sprint 13b — Dolar fiyat girişi, TCMB kuru (11.11.2026)

Müşteri kararları: kur = **TCMB döviz satış**; Türkçe sayfada **TL**, diğer dillerde **USD**; ödeme Türkçe'de TL, diğer
dillerde **USD** (kur siparişe kaydedilir).

- Fiyat girişi (ürün sayfası "Fiyat" kartı ve fiyat merkezi): para birimi seçilir — varsayılan **USD**; TL ve EUR da olur.
  Mevcut 41 TL fiyat aynen kalır (Türkçe'de TL, diğer dillerde kurla $).
- Çeviri: `src/lib/fx/convert.ts` (tam sayı kuruş/cent, yarım yukarı yuvarlama), katalog okurken dile göre (`src/lib/catalog/index.ts`),
  sepet/sipariş sunucuda aynı kuralla (`resolveCartLines`). Kur yoksa fiyat uydurulmaz: "Fiyat için teklif alın".
- Kur kaynağı: TCMB `today.xml` ForexSelling (`src/lib/fx/rates.ts`), veritabanında `FxRate` tablosu. Sayfalar TCMB'yi
  beklemez: kayıtlı kur hemen kullanılır, 5 dakikadan eskiyse arka planda yenilenir (TCMB yanıtı ~9 sn sürebiliyor).
  TCMB günde bir kez (~15:30) yayınlar; hafta sonu cuma kuru geçerlidir.
- Üst şerit: `USD ₺… · EUR ₺… (TCMB satış <tarih>)`, tarayıcı 5 dakikada bir `/api/v1/fx`'ten günceller (mobil dahil).
- Sipariş: `Order.currency` (TRY/USD), dönüşüm olduysa `fxCurrency` + `fxRate4` (admin sipariş detayında "Sipariş kuru").
  Diğer dillerden sipariş için **aktif USD banka hesabı** gerekir (Admin › Banka hesapları → para birimi USD);
  yoksa ödeme sayfası uyarı gösterir ve sipariş alınmaz. Ödeme bildirimi yalnız sipariş para birimindeki hesaplara.
- Testler sabit kurla çalışır (`FX_FIXTURE`), TCMB'ye bağlanmaz.

Canlıya geçiş: `npx prisma migrate deploy` (yeni `FxRate` tablosu + `Order.fxCurrency/fxRate4`, yalnız ekleme).
Sunucunun dışarıya (www.tcmb.gov.tr, 443) HTTPS erişimi olmalı.
