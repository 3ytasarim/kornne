# Ölçüm planı — GA4 / Tag Manager / Search Console (Sprint 10)

> **Durum: READY-BUT-DISABLED.** Kod hazır ve test edildi. Google hesaplarına bağlantı yok, hiçbir mülk, container veya etiket oluşturulmadı. Varsayılan durumda sayfada ne çerez banner'ı ne de Google betiği vardır. Kimlikler müşterinin **mevcut** hesaplarından alınır.

## 1. Mimari

| Parça | Dosya | Görev |
|---|---|---|
| Yapılandırma | `src/lib/analytics/config.ts` | Kimlikler yalnız ortam değişkenlerinden okunur, biçimleri doğrulanır, varsayılan KAPALI. Ayrıca CSP host listesi |
| Olay sözlüğü + PII filtresi | `src/lib/analytics/events.ts` | İzinli olaylar ve parametreler; ticari olay yasağı; kişisel veriye benzeyen değerler atılır |
| İzin | `src/lib/analytics/consent.ts` | `kornne_consent` çerezi, Consent Mode v2 eşlemesi |
| Tarayıcı çalışma zamanı | `src/lib/analytics/client.ts` | Google betiğini yalnız izin sonrası yükler; `track()`, `trackLeadOnce()` |
| Arayüz | `src/components/analytics/AnalyticsRoot.tsx` | Banner, tercih paneli, sayfa görüntüleme, tıklama delegasyonu, `TrackEvent` |
| Admin | `/admin/analytics` | Dürüst durum ekranı: yapılandırma, izin modu, olay planı. Sentetik metrik yok |

**Ortam değişkenleri** (`.env.example`, `deploy/env/*.env.example`):

| Değişken | Açıklama |
|---|---|
| `ANALYTICS_ENABLED` | Açık katılım (`true`) |
| `ANALYTICS_GA4_MEASUREMENT_ID` | `G-…` (gtag.js modu) |
| `ANALYTICS_GTM_CONTAINER_ID` | `GTM-…` — ikisi birden tanımlıysa Tag Manager kullanılır |
| `COOKIE_POLICY_APPROVED` | Çerez metninin hukuki onayından sonra `true` |
| `GOOGLE_SITE_VERIFICATION` | Search Console HTML etiketi doğrulama değeri |

Sayfalar statik üretildiği için bu değerler **build anında** okunur: değiştirmek yeni build gerektirir. Staging ve production ayrı build'dir.

## 2. İzin (Google Consent Mode v2) — "temel mod"
- **Seçimden önce:** sayfada hiçbir Google betiği yok, `dataLayer` yok, analitik çerezi yok.
- **Reddedilirse:** `kornne_consent=v1.a0.m0.<gün>` yazılır; sonraki ziyaretlerde de hiçbir betik yüklenmez.
- **Kabul edilirse, şu sırayla:**
  1. `gtag('consent','default', {analytics_storage, ad_storage, ad_user_data, ad_personalization: 'denied', wait_for_update: 500})`
  2. `gtag('consent','update', <seçim>)`
  3. Etiket yapılandırması
  4. Betik yüklenir
- **Reklam sinyalleri:** yalnız "Pazarlama" seçilirse `granted` olur. Şu anda reklam etiketi kullanılmıyor.
- **Tercih değişikliği:** footer › Çerez tercihleri. Geri çekilince `consent update denied` gönderilir ve `_ga*` çerezleri silinir.
- **Çerez:** `kornne_consent` — 180 gün, `SameSite=Lax`, HTTPS'te `Secure`. Sürüm (`CONSENT_VERSION`) artarsa izin yeniden sorulur.
- **Metin:** hukuki onaya kadar banner "Bu metin hukuki onay sürecindedir." uyarısını taşır. Kesin hukuki uygunluk iddia edilmez.

## 3. Olaylar (yalnız bunlar gönderilebilir)

| Olay | Tetikleyici | Parametreler |
|---|---|---|
| `page_view` | İlk yükleme ve her istemci gezintisi (izin sonrası) | `page_location` (**sorgu dizesi olmadan**), `page_title`, `language` |
| `view_item` | Ürün sayfası | `items[{item_id: eski ürün no, item_name, item_category}]` |
| `view_item_list` | Kategori listesi | `item_list_id`, `item_list_name`, ilk 24 ürün |
| `select_item` | Liste veya ilgili ürün kartı tıklaması | Liste bağlamı + ürün |
| `search` | Arama sonuç sayfası | `search_term` (kişisel veriye benziyorsa **gönderilmez**), `results_count` |
| `add_to_quote_list` | Ürün teklif listesine eklendi | `items[{item_id, item_name, item_variant, quantity}]` |
| `generate_lead` | **Teklif talebi kaydedildi** (referans oluştu) | `lead_source: "quote_list"`, `items_count`. Referans başına **tek kez** (sessionStorage); referansın kendisi gönderilmez |
| `whatsapp_click` | wa.me bağlantısı | `link_location` (home_hero / product / contact / floating_button). Mesaj metni gönderilmez |
| `contact_click` | `tel:` / `mailto:` | `method` (phone/email), `link_location`. Numara ve adres gönderilmez |

**Gönderilmeyen olaylar** (kodda engelli):

- Ticari olaylar: `purchase`, `begin_checkout`, `add_payment_info`, `add_shipping_info`, `add_to_cart`, `view_cart`, `refund` (fiyatlı ödeme kapalı).
- Hesap olayları: `login`, `sign_up`.

**Fiyat bilgisi:** `value`, `price` ve `currency` hiçbir olayda yok, çünkü fiyatlar onaysız.

## 4. Kişisel veri yasağı (test kanıtı)
- **Gönderilmeyenler:** ad, e-posta, telefon, firma, mesaj/not, teklif referansı, oturum, token, IP. Bunlar hiçbir olay parametresine, URL'ye veya loga girmez.
- **Otomatik ayıklama:** `looksPersonal()` e-posta, ≥ 9 haneli telefon, `TKL-`/`KRN-` referansı ve URL kimlik bilgisi biçimlerini yakalar; bu değerler **atılır** (maskelenmez).
- **Testler:**
  - `tests/unit/analytics.test.ts` (11 test)
  - `tests/e2e/consent.prodlike.spec.ts` (7 test): gerçek teklif gönderiminde `dataLayer` JSON'unda e-posta, ad, telefon, not ve referans **yok**. Çift tıklamada tek `generate_lead`.
- **Ağ izolasyonu:** E2E testlerinde Google'a giden her istek yakalanıp **iptal edildi**. Test kimliği sahtedir: `G-KORNNETEST0`.

## 5. Kurulum yönergeleri (müşteri erişimi ve onayıyla; bağlantı olmadan çalıştırılamaz)
1. **GA4:**
   - Mevcut mülkte bir web veri akışı açılır (`https://kornne.com`).
   - Ölçüm kimliği `ANALYTICS_GA4_MEASUREMENT_ID` değişkenine yazılır.
   - Staging için **ayrı** bir mülk/akış kullanılır.
   - Gelişmiş ölçümde "form etkileşimleri" kapatılır (kendi olaylarımız yeterli; çift sayımı önler).
   - `generate_lead` "anahtar etkinlik" olarak işaretlenir.
2. **GTM (isteğe bağlı):**
   - `ANALYTICS_GTM_CONTAINER_ID` girilir.
   - Container'da Google etiketi + olay etiketleri kurulur; tetikleyici `dataLayer` `event` adlarıdır.
   - Consent Mode'a uyum için etiketlerde "ek izin kontrolü" kullanılır.
3. **DebugView doğrulaması:**
   1. Staging'de `ANALYTICS_ENABLED=true` ile build alınır.
   2. Çerez kabul edilir.
   3. GA4 DebugView'da `page_view`, `view_item`, `add_to_quote_list`, `generate_lead` görülür.
   4. Parametrelerde PII olmadığı elle kontrol edilir.
4. **Search Console:**
   - Domain property (DNS TXT) **cutover günü** ve müşteri onayıyla eklenir. Alternatif olarak HTML etiketi `GOOGLE_SITE_VERIFICATION` ile verilir.
   - Sitemap (`/sitemap.xml`) yalnız `SITE_INDEXABLE=true` olan production'da gönderilir.
   - Adres değişikliği aracı gerekmez (aynı alan adı).
5. **Google Ads:** bağlantı yok. Kurulursa yalnız "Pazarlama" izniyle çalışır ve dönüşüm `generate_lead` olur.

## 6. Açık engeller
- GA4, GTM ve Search Console erişimi (müşteri).
- Çerez/KVKK metinlerinin hukuki onayı → `COOKIE_POLICY_APPROVED=true`.
- Çerez metninin EN/FR/RU/AR çevirileri taslak durumda; hukuki metinle birlikte onaylanmalı.
