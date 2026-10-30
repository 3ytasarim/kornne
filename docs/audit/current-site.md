# kornne.com — Mevcut Site Denetimi (Sprint 0)

**Tarama tarihi:** 21–22 Ekim 2026 · **Yöntem:** salt-okunur, oran sınırlı HTTP taraması (1,3 sn/istek, tek bağlantı, yalnız GET; form gönderimi, giriş, sepet işlemi yok) · **Ham veri:** `data/source-crawl/` (HTML gitignore'da, loglar ve SHA-256 özetleri mevcut) · **Betikler:** `scripts/audit/*`

> Bu belge yalnız **kamuya açık vitrinin** gösterdiklerini kaydeder. Yönetim paneli, veritabanı, sipariş geçmişi, Search Console, GA4, Google Ads ve Merchant Center'a erişimim yok; bu sistemler **kontrol edilmedi**.

## 1. Platform ve barındırma

| Bulgu | Değer | Kaynak |
|---|---|---|
| Sunucu | Hostinger (hPanel), `server: hcdn`, `platform: hostinger` | HTTP başlıkları |
| Yazılım | PHP 7.2.34 (EOL), jQuery 3.6 + Bootstrap, hazır "Nest" e-ticaret teması | `x-powered-by`, `assets/css/main.css` |
| Yayıncı | "Bilişim Destek Hizmetleri" (meta publisher, footer bağlantısı) | `<meta name="publisher">` |
| Oturum | `PHPSESSID` çerezi; **dil oturumda tutuluyor** (`/lang-eng/` vb. oturumu değiştiriyor) | tarama |
| `www` | `https://www.kornne.com/` → **302** → apex (kalıcı olmalı) | curl |
| HTTP | `http://kornne.com/` → 301 https | curl |
| robots.txt | **404** (yok) | curl |
| sitemap.xml | **404** (yok) | curl |
| Analitik | GA4 `G-9Q6H0QETRF` + eski Universal Analytics `analytics.js` (404 sayfasında) | kaynak kod |

> Hetzner değil, **Hostinger** üzerinde çalışıyor. Hetzner geçişi bir **barındırma göçü** demek; DNS ve e-posta (MX) kayıtları ayrıca envanterlenmeli (open-questions.md).

## 2. Sayfa envanteri (özet)

Ayrıntı: `page-inventory.csv` (232 satır, URL + dil + tip + HTTP + title/H1/meta/canonical/OG/hreflang/robots/JSON-LD + SHA-256 + tarih).

| Dil | Anasayfa | Kategori sayfası* | Ürün | Kurumsal/yasal | Yardımcı sayfa** | Blog |
|---|---|---|---|---|---|---|
| TR | 1 | 14 | **41** | 4 | 9 | 1 (boş) |
| EN | 1 | 16 | **36** | 1 (boş) | 9 | 1 |
| FR | 1 | 16 | **38** | 1 (boş) | 9 | 1 |
| RU | 1 | 4 | **0** | 1 (boş) | 9 | 1 |
| AR | 1 | 4 | **0** | 1 (boş) | 9 | 1 |

\* Sayfalama dahil (`/kategori/x/2`, `/kategori/x/3` ve page-1 kopyası `/kategori/x/1`). \*\* giriş-yap, kayıt-ol, şifremi-unuttum, sepetim, favorilerim, siparişim-ne-durumda, ödeme-bildirimi, banka-hesapları, iletişim.

## 3. Katalog

- **TR: 41 benzersiz ürün** (kaynak `urun-id` 78–217). Vitrin "Tüm Ürünler" için **40** diyor: #208 *İkizray Kurban Kancası* yalnız *Kurban Ekipmanları*'nda listeleniyor, Tüm Ürünler'de yok.
- Kategori sayıları (TR): Mezbaha **37** · Robotik **26** · Kurban **16** · Tüm Ürünler **40 (+1 = 41)**. Üyelikler çakışıyor (bir ürün 2–4 kategoride).
- **EN (36) ve FR (38) ayrı ürün kayıtları** (EN id 140–176, FR 177–216). Ortak anahtar yok; görseller her dil için yeniden yüklenmiş. Sıralama + anlam + fiyat uyumuyla **önerilen** eşleme: `locale-product-mapping.csv` (30/41 üründe 3 dilde fiyat birebir aynı → eşleme güçlü; 11 üründe dil bazlı fiyat çelişkisi).
- **RU ve AR'da kategori var, ürün yok.** Kategori adları çevrilmiş, slug'lar anlamsız (`lang-russian-robotics` = "Все продукты").
- Ürün sayfası alanları: H1, fiyat, eski fiyat, indirim etiketi, görüntülenme sayısı, kısa açıklama (stok kodu + başlık), açıklama sekmesi (HTML), yorum sekmesi (hepsi 0), galeri, "Sepete Ekle", "WhatsApp Sipariş", favori.
- **Teknik tablo, PDF, video: hiçbir üründe yok.** Varyant: yalnız #107 (6'lı / 8'li kanca; varyant fiyatı AJAX ile geliyor, alınmadı).
- Stok/temin göstergesi yok → `availability = unknown`.
- Ayrıntı: `product-inventory.csv` (115 satır = 41 TR + 36 EN + 38 FR), `category-listing-inventory.csv` (596 liste kartı).

## 4. Medya

- 451 benzersiz medya URL'si; **445 indirildi**, bayt-bayt orijinal + SHA-256 + boyut (`media-inventory.csv`, dosyalar `data/source-media/originals/`, 106,6 MB).
- **6 kırık görsel (404):** `Kornne-Klasik-Kesim-Hucre-61.jpg` (Kurban Yatırma Kabini galerisi) ve kurumsal sayfadaki `belge1–5.jpg`.
- **TR ürün görsellerinden 16 tanesi 500×500 altında; bunların 9'u ürünün ana görseli** (Merchant 31 Ocak 2027 asgari çözünürlük şartı için risk). Tüm sitede 500 px altı görsel: 101.
- EN/FR ürün görsellerinin **223/230'u TR görselleriyle bayt-bayt aynı** (SHA-256) → taşımada tek kopya yeterli.
- Ürün görsellerinin **hiçbirinde `alt` yok**. Dosya adları kısmen anlamlı (`Kornne-Dairesel-Hucre-63.jpg`), kısmen değil (`IMG-20240404-WA0002.png`, `WhatsApp Görsel 2024-05-07…jpg`).
- Logo: `upload/Kornne_Logo.png` 500×500 PNG (vektör yok). Favicon aynı dosya. Baskın renk **#293E59** (lacivert) + **#C9CED5** (gümüş).

## 5. Ticari akışlar (yalnız gözlem, işlem yapılmadı)

| Akış | Durum |
|---|---|
| Sepet | AJAX `ajax.php?islem=sepet-varyant` (oturum bazlı) — denenmedi |
| WhatsApp sipariş | `api.whatsapp.com/send?phone=905354068002&text=Merhaba, <ürün URL> …` + sağ altta sohbet widget'ı |
| Ödeme | "Ödeme bildirimi" formu + "Banka hesapları" — **IBAN'ların tamamı `TR 000 0000 …` (sıfır)**; Vakıfbank, Ziraat, İş Bankası… |
| Üyelik | giriş / kayıt / şifremi unuttum formları mevcut (gönderilmedi) |
| Sipariş sorgulama | form mevcut |
| Yorum | giriş gerektiriyor; hiçbir üründe yorum yok |
| Blog | sayfa var, **yazı yok** |
| Online ödeme (POS) | görünür bir sanal POS / ödeme sağlayıcısı **bulunamadı** |

## 6. SEO / teknik bulgular

- `<title>` ve H1 var; **meta description çoğu sayfada boş** (kategori ve ürünlerde `content=""`).
- **hreflang yok**; dil sürümleri oturumla değişiyor, **canonical** EN/FR/RU/AR anasayfada `https://kornne.com/`, kategori sayfalarında **var olmayan** `/lang-ru/kategori/...` adreslerine işaret ediyor.
- Oturumsuz istekte EN/FR ürün URL'leri (ör. `/urun/circular-cutting-cell`) **200 + boş sayfa** dönüyor → Googlebot dil sürümlerini göremiyor; **soft-404**: olmayan ürün URL'si de 200 dönüyor.
- `kategori/x` ile `kategori/x/1` aynı içerik (yinelenen sayfa).
- **JSON-LD**: her üründe `AggregateRating 5.0 / reviewCount 1` + yazarı firma olan sahte `Review`; `AggregateOffer lowPrice "37.509"` (sayfadaki fiyatla ilgisiz), `offerCount 100`; marka iki farklı yazımla; SKU bazı ürünlerde yinelenen. Google yapılandırılmış veri politikasına aykırı → yeni sitede **kaldırıldı**.
- Ürün açıklamalarında ikinci `<h1>`; açıklamaların 21/41'i < 40 karakter.
- Meta robots çelişkili/standart dışı (`googlebot: "3 days"`, `"sitemap"` vb.).
- OG görseli tek ve dosya adında boşluk/Türkçe karakter (`robotıc systems & (600 x 160 piksel).png`).
- Kırık linkler: kurumsal sayfadaki 5 belge görseli; telefon bağlantısı `tel:` içine **adres** yazılmış.

## 7. Marka / kimlik tutarsızlıkları

- Yasal sayfalarda **üç farklı satıcı kimliği**: İade politikası "Mezbaha Teknolojileri", KVKK metni "KORNNE A.Ş.", mesafeli satış sözleşmesinde satıcı unvanı/vergi alanları **boş**; JSON-LD marka "KORNNE MEZBAHA TEKNOLOJİLERİ" / "KORNNE".
- Kurumsal metin "Mezbaha Teknolojileri"yi anlatıyor; footer `MezbahaTeknolojileri.Com.Tr` bağlantısı veriyor (grup şirketi olabilir — doğrulanmalı).
- Telefonlar: header/WhatsApp +90 535 406 80 02; sözleşme +90 262 502 18 94; iade sayfasında 5 ek cep numarası; e-posta info@, account@, sales@kornne.com.

Tüm maddeler `data-quality.md` doğrulama kuyruğunda; **hiçbiri düzeltilmedi, kaynak sitede değişiklik yapılmadı.**
