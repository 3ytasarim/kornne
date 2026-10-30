# KORNNE — Sprint 6 + 7 raporu

**Tarih:** 22 Ekim 2026 · **Çalışma alanı:** `D:\Projects\kornne`

Bu sprintte yapılmayanlar:

- Commit, push veya deploy yok.
- Canlı kornne.com, Hostinger, DNS, Merchant, Search Console, GA4 ve Ads değiştirilmedi.
- Diğer projelere dokunulmadı.
- Sprint 8'e geçilmedi.

## 1. Yapılanlar ve gerçek modül durumu

Modül durumları gerçek koda göre sınıflandırıldı ve panelde her ekranın başlığında gösteriliyor. Durumlar: **İşlevsel / Kısmen / Hazırlık / Bloke**.

| Modül | Durum | Gerçekte yapılabilen |
|---|---|---|
| Panel (dashboard) | İşlevsel | Canlı sayımlar: teklif (bugün, yeni, işlemde, takibi geçmiş), katalog (yayında/taslak/arşiv, onaylı fiyat 0/41, bekleyen öneri, eşleşmeler). Veri kalitesi listesi ilgili ekrana bağlanır (#208, 11 çelişki, 6 hatalı indirim, 6 kırık görsel, 74 eşleşme, 114 otomatik alt metin). Rol bazlı. **Ciro gösterilmez** (online satış kapalı). İstanbul saati. |
| Ürünler | İşlevsel | Liste: TR karakterli arama, filtreler, sıralama, sayfalama, erişilebilir toplu taslak/arşiv. Ürün ekranı: içerik, durum, SKU, sıra, diller, kategori ve ilişkiler, seçenekler, görseller, teknik özellik ve PDF, geçmiş, önizleme. Yeni ürün taslak olarak oluşur. |
| Kategoriler | İşlevsel | 5 dilde ad, adres, açıklama, SEO alanları; adres değişince 301 |
| Katalog QA | İşlevsel | Aktarım ve veri kalitesi görünümü; eşleşme kararları artık karşılaştırma ekranına gidiyor |
| Fiyatlar | İşlevsel | Öneri; dört göz onayı; ret, geri çekme, geri alma; geçmiş; çelişki ve indirim filtreleri. Toplu onay yok. |
| Stok | Hazırlık | Kaynakta stok verisi yok (41/41 bilinmiyor); salt okunur |
| Medya | İşlevsel | 445 orijinal (salt okunur dosya); 5 dilde alt metin ve açıklama; kullanım yerleri; güvenli yükleme; 6 kırık görsel raporu |
| Teklif talepleri (CRM) | İşlevsel | Durum makinesi, sorumlu atama, iç not, takip tarihi, iyimser kilit, filtreler, CSV dışa aktarma (yalnız Süper Yönetici ve Yönetici), bildirim kuyruğu durumu |
| Müşteriler | Kısmen | Teklif kişileri: maskeli liste, denetimli detay. Online müşteri hesabı sistemi yok; eski hesaplar taşınmadı. |
| Siparişler | Bloke | Ödeme kapısı kapalı; sipariş 0. Ön koşul listesi gösterilir. |
| İçerik (CMS) | İşlevsel | Sayfa, yasal metin ve blog; 5 dil; taslak → onay → yayın; sürümler, önizleme, geri yükleme, arşiv, yasal onay; SSS ve ürün soru-cevap; zaman sınırlı duyuru; menü ve footer |
| Çeviriler | İşlevsel | Dil kapsamı raporu; 74 EN/FR eşleşme için karşılaştırma, onay, ret, yeniden açma, yeniden eşleştirme; dil bazında yayın ve kaldırma |
| SEO / GEO | Kısmen | Dil bazlı başlık/açıklama raporu, kanonik, hreflang (yalnız yayımlanmış çeviriler), indekslenebilirlik ve uyarılar. Alanlar ilgili editörlerde düzenlenir. Search Console bağlantısı yok. |
| Yönlendirmeler | Kısmen | 125 eski URL salt okunur listelenir; döngü/zincir kontrolü (0 sorun); slug değişiklikleri otomatik 301 |
| Merchant hazırlık | Hazırlık | Ürün başına 9 koşullu eksik listesi; 0/40 feed'e hazır. Entegrasyon değil. |
| Ayarlar | Kısmen | İletişim ve firma bilgileri tek kaynak (doğrulanmamış değer vitrine çıkmaz); ödeme kapısı durumu salt okunur; teklif saklama politikası taslağı. Bildirim, ödeme, Merchant, GSC, GA4 bağlantıları "bağlı değil". |
| Kullanıcılar | İşlevsel | Tek kullanımlık davet ve şifre sıfırlama bağlantısı (e-posta yok), rol değiştirme, pasifleştirme, oturum kapatma, son Süper Yönetici koruması. MFA hazırlık. |
| Denetim kaydı | İşlevsel | Filtreler, sayfalama, önce/sonra görünümü |

**Vitrin (Sprint 7):**

- Kurumsal ve yasal sayfalar artık veritabanında, yayımlanmış sürümden okunuyor; adresler değişmedi.
- Başlık ve footer menüleri, iletişim bilgileri ve Organization verisi paneldeki ayarlardan geliyor.
- Yeni `/blog`, `/blog/[slug]` ve `/sss` sayfaları (diğer dillerde `/en/faq` vb.) yalnız içerik varsa açılır.
- Ana sayfa ve üst şerit duyuruları tarih aralığı denetimli.
- Ürün sayfasında soru-cevap, doğrulanmış PDF ve editörün seçtiği ilgili ürünler gösterilir.
- Ürün ve kategori sayfalarında editörün SEO başlığı ve açıklaması kullanılır.
- CMS sayfaları sitemap'e yalnız indekslenebilir ortamda girer.

**Eski içeriğin aktarımı:** `scripts/cms/seed-content.ts`. Kuru çalıştırma varsayılandır; uygulama için hedef veritabanı doğrulaması (`--confirm-db`) gerekir ve mevcut satırların üzerine asla yazmaz. Aktarılanlar:

- 4 eski sayfa (8 dil sürümü)
- 8 menü bağlantısı
- 9 iletişim ve sosyal medya ayarı (UNVERIFIED)

## 2. Migration ve veri güvenliği

- **Tek eklemeli migration:** `prisma/migrations/20261022120000_sprint6_7_admin_cms/migration.sql`, ayrıntılar `docs/data-migration/commerce-schema-changes.md` formatında aşağıda.
  - **11 yeni tablo:** UserInvite, ProductDocument, PriceEvent, PageRevision, FaqItem, Banner, BannerTranslation, MenuItem, SiteSetting, NotificationOutbox, QuoteNote.
  - **5 yeni enum** ve 2 enum değeri: `PageKind.BLOG`, `QuoteStatus.QUOTE_PREPARED`.
  - **Mevcut tablolara eklenen alanlar:** hepsi boş bırakılabilir ya da varsayılanlı.
    - `Price`: `createdById`, `evidence`, `note`.
    - `QuoteRequest`: `assignedToId`, `followUpAt`, `outcome`, `version`.
    - `PageTranslation`: iş akışı ve yayın alanları.
    - `Product.archivedAt`.
    - `ProductSpec`: `source`, `verifiedAt`.
    - `MediaAsset`: `origin`, `uploadedById`.
    - `LegacyMatchSuggestion`: `note`, `previousRedirectTo`.
  - **Yıkıcı ifade: 0.** SQL'deki tek "DELETE" eşleşmeleri yabancı anahtar `ON DELETE` kurallarıdır.
- **Uygulama sırası:** önce `kornne_test`, sonra `neondb` (`migrate deploy`). `migrate reset`, `db push`, `DROP` veya `TRUNCATE` kullanılmadı.
- **Sayımlar:**

| | Önce | Migration sonrası | Sprint sonu |
|---|---:|---:|---:|
| Product | 41 | 41 | 41 |
| MediaAsset | 445 | 445 | 445 |
| Redirect | 125 | 125 | 125 |
| Price (VERIFIED) | 41 (0) | 41 (0) | 41 (0) |
| LegacySourceRecord | 594 | 594 | 594 |
| Eşleşme (karara bağlanan) | 74 (0) | 74 (0) | 74 (0) |
| Page / MenuItem / SiteSetting | 0/0/0 | 0/0/0 | 4/8/9 (tohum) |

- **Kanıt dosyaları:** `docs/data-migration/evidence/s67-before.json`, `s67-after-migration.json`, `s67-after-cms-seed.json`; `data/qa-logs/s67-residue.json`.
- **Bütünlük:** importer kuru çalıştırması 0 değişiklik gösteriyor; 445 medya hash'i doğrulandı.
- **Test verileri:** gerçek DB'de yalnız `@kornne.test` ve "E2E" işaretli satırlar yazıldı; tamamı geri alındı (sprint sonu artık 0).
  - Bir test zaman aşımında yarıda kalınca bir eşleşme (EN #140) onaylı kaldı. Satır satır geri alındı ve doğrulandı.
  - Temizlik o günden beri hem `afterEach` hem global teardown'da çalışıyor.
- **Geri dönüş planı:** yeni tablolar ve kolonlar kaldırılabilir; mevcut veri değişmedi. `QuoteStatus.QUOTE_PREPARED` ve `PageKind.BLOG` enum değerleri PostgreSQL'de silinemez ama kullanılmadıkça zararsızdır.

## 3. Yetki (RBAC) ve kişisel veri testi

- **Matris:** `docs/architecture/admin-permission-matrix.md`, koddan üretildi.
  - 16 ekran ve 32 işlem.
  - Varsayılan ret; reddedilen her deneme `auth.denied` olarak kaydedilir.
  - Her Server Action ve Route Handler ilk satırda sunucu tarafı yetki kontrolü yapar.
- **Sunucu tarafı kanıt (e2e):** düşük yetkili kullanıcılar, yetkili kullanıcının form alanlarını **doğrudan sunucuya** gönderdi.
  - Ürün editörünün fiyat onayı → reddedildi, DB değişmedi, denetim kaydı yazıldı.
  - SEO editörünün teklif durum değişikliği → reddedildi.
  - Yabancı origin isteği → Next.js tarafından reddedildi (CSRF).
  - Dışa aktarma: anonim kullanıcı yönlendirildi, Sipariş Operatörü 403 aldı.
  - Ürün editörü kullanıcılar, teklifler, içerik ve ayarlar ekranlarına giremedi.
- **Kişisel veri:**
  - Teklif ve müşteri listelerinde iletişim bilgisi yok (e2e ile doğrulandı).
  - Detay yalnız yetkili rollere açık ve her görüntüleme kaydediliyor.
  - Müşteri adresi URL'de değil, geri döndürülemez bir anahtarla gösteriliyor.
  - Dışa aktarma yalnız Süper Yönetici ve Yönetici için; formül enjeksiyonuna karşı korumalı.
  - İç not içeriği denetim kaydına yazılmıyor; bildirim kuyruğunda kişisel veri yok.
- **Eşzamanlılık:** kritik işlemler veritabanında atomik; testlerle kanıtlandı.
  - Kapsananlar: fiyat onayı, eşleşme kararı, çeviri yayını, teklif durumu, davet kullanımı.
  - Ürün ve içerik formları iyimser kilit kullanıyor.

## 4. Çeviriler ve 41 fiyatın durumu

- **Eşleşmeler:** 74 EN/FR eşleşmenin hiçbiri otomatik onaylanmadı (74 karar bekliyor, 0 onay, 0 ret).
  - Onay yalnız yayında olmayan bir editör taslağı oluşturur; yayın ayrı bir adımdır. Eski URL ancak yayında yeni sayfaya yönlenir.
  - 8 düşük güvenli öneri için "kontrol ettim" kutusu ve gerekçe zorunlu.
  - **Kurban Yatırma Kabini** (EN #142, FR #179) için müşteri onayı referansı zorunlu. Kanıtlar: ortak görsel 0, fiyat yaklaşık 6,5 kat farklı.
- **RU/AR:** ürün sayfası oluşturulmadı (404, testli). Bu dillerde kurumsal sayfa Türkçe metni uyarıyla gösteriyor ve indekslenmiyor.
- **Fiyatlar:** 41 fiyatın **41'i hâlâ UNVERIFIED**. Yönetici önerisi ve onaylı fiyat sayısı 0.
  - 11 dil-fiyat çelişkisi ve 6 hatalı indirim filtrelenebilir; sistem bunları otomatik çözmüyor.
  - Onaylı bir fiyat bile yalnız vitrindeki gösterimi değiştirir. Ödeme kapısı sunucuda ayrı ön koşullarla kapalı ve panelden açılamıyor.
- Ayrıntı: `docs/i18n/translation-approval-report.md`, `docs/admin/catalog-pricing-workflow.md`.

## 5. Test sayıları ve performans

| | Sprint 4+5 | **Sprint 6+7** |
|---|---:|---:|
| Vitest (unit + entegrasyon) | 85 | **121/121** |
| Playwright E2E | 49 | **63/63** |
| Ekran görüntüsü (bu sprint) | 16 | **43** (`s67-*`) |
| Lint / typecheck / i18n / build | ✅ | ✅ |

- **Mobil Lighthouse (medyan):** ana sayfa 85, kategori 84, ürün 87–88, AR 87, arama 88, teklif formu 89, sepet 88, kurumsal 90, admin giriş 84.
  - Erişilebilirlik ve Best Practices 100; CLS 0.
  - Vitrinde SEO 69, nedeni bilinçli `noindex` (`is-crawlable`). Admin girişinde 58, nedeni `noindex` ve meta açıklama olmaması.
- **Testlerin bulduğu hatalar:** 10 gerçek hata bulunup düzeltildi; liste `docs/qa/sprint-6-7-test-results.md` içinde. Başlıcaları:
  - Çeviri yayınında yarış.
  - Tek tıklamada gönderen onay düğmesi.
  - Hata sonrası silinen form alanları.
  - Teklif durum formunun boş "sonuç" değerini reddetmesi.
  - 320 px'de yatay taşma.

## 6. Açık blokeler

1. **Neon parolası hâlâ yenilenmedi.** Kullanıcı aksiyonu, öncelikli.
2. Doğrulanmış 41 fiyat ve KDV; 11 çelişki ve 6 indirim kararı.
3. Ticari unvan, vergi ve MERSİS; kargo ve kurulum politikası.
4. Hukuken onaylı KVKK, çerez, mesafeli satış ve iade metinleri; teklif saklama süresi.
5. 74 EN/FR eşleşme kararı; RU/AR içerik sahibi.
6. #208 kararı (307 → 301 dahil).
7. 6 kırık görselin orijinalleri; doğrulanmış teknik veriler ve PDF'ler; stok ve termin bilgisi.
8. Bildirim sağlayıcısı ve alıcı e-postası (kuyruk hazır, `BLOCKED`).
9. Ödeme sağlayıcısı, bankalar, ticari onaylar (kapı kapalı).
10. Hetzner VPS, staging alan adı, DNS; Merchant, Search Console, GA4 ve Ads erişimleri.

## 7. Sprint 8 + 9 için hazırlık

Ayrıntı `docs/next-steps/sprint-8-9-readiness.md` içinde. Özet:

- SEO alanları dil bazında düzenlenebilir ve vitrine bağlı.
- hreflang yalnız yayımlanmış çevirilerle eşleşiyor.
- Sitemap kodu CMS ve blogu da kapsıyor, ancak ortam `noindex` olduğu için bilerek boş.
- JSON-LD: Product (Offer yok), FAQPage, Article, Organization.
- Merchant hazırlık ekranı: 0/40 hazır; başlıca eksik onaylı fiyat ve stok.

Sprint 8+9 için gerekenler: fiyat ve KDV onayları, Search Console ve Merchant salt-okunur erişimi, staging ortamı.

## Dosya yolları

- **Belgeler:**
  - `docs/sprints/sprint-6-7-report.md`
  - `docs/architecture/admin-permission-matrix.md`
  - `docs/admin/catalog-pricing-workflow.md`
  - `docs/admin/quotes-crm-workflow.md`
  - `docs/i18n/translation-approval-report.md`
  - `docs/cms/content-management-guide.md`
  - `docs/qa/sprint-6-7-test-results.md`
  - `docs/next-steps/sprint-8-9-readiness.md`
  - `docs/qa/screenshots/s67-*.png` (43 adet)
  - `docs/qa/lighthouse/`
- **Servisler:**
  - `src/lib/admin/{prices,products,quotes,media,users,translations,redirect-check,revalidate,run-action,action-state,format}.ts`
  - `src/lib/cms/{service,store,settings}.ts`
  - `src/lib/auth/{rbac,guard}.ts`
- **Admin:** `src/app/admin/(panel)/{products,categories,pricing,inventory,media,orders,quotes,customers,content,translations,seo,redirects,merchant,settings,users,audit}/…`, `src/app/admin/davet/[token]`, `src/app/admin/quotes/export/route.ts`.
- **Bileşenler:** `src/components/admin/{forms,ui,RichTextEditor,subnavs}.tsx|ts`.
- **Vitrin:**
  - `src/app/[locale]/{sayfa/[slug],blog,blog/[slug],sss}/page.tsx`
  - `src/components/layout/{Announcements,SiteHeader,SiteFooter}.tsx`
- **Script:** `scripts/cms/seed-content.ts`, `scripts/qa/s67-residue.mjs`, `scripts/i18n/sprint67-keys.mjs`.
- **Testler:**
  - `tests/unit/admin.test.ts`
  - `tests/integration/{admin-services,translation-flow}.test.ts`
  - `tests/e2e/{sprint67,visual67}.spec.ts`
  - `tests/e2e/{cleanup,helpers}.ts`
