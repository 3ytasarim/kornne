# Medya Depolama ve Yedekleme

## Bugün (geliştirme)

| Katman | Konum | Not |
|---|---|---|
| Orijinal (değişmez) | `data/source-media/originals/` — 445 dosya, 106,6 MB | Eski siteden bayt-bayt; SHA-256 `MediaAsset.sha256` |
| Sunulan kopya | `public/upload/<orijinal ad>` | Eski `/upload/...` URL'leri **aynen** çalışır (statik) |
| Özel karakterli adlar | `src/app/upload/[...path]/route.ts` | Statik sunucunun çözemediği yollar (ör. ham `&`) için güvenli yedek; traversal yok, yalnız var olan dosya, gerçek 404 |
| Türevler | Next.js Image (`/_next/image`) → AVIF/WebP, `deviceSizes` 360–2048, `srcset`, 30 gün önbellek | Orijinal değişmez; kırpma yok (`object-contain`); LCP görseli `priority`, diğerleri lazy |
| Kayıt | `MediaAsset` (storageKey, publicPath, sha256, mime, bytes, width, height) + `MediaTranslation` (dil bazlı alt) + `ProductMedia` | |

Kaynakta zaten kırık 6 URL yeni sitede de **404** döner (bkz. data-quality-issues.md).

## Canlı için seçenekler (karar: müşteri + Sprint 11; deploy yapılmadı)

| | A) VPS üzerinde kalıcı dizin (önerilen başlangıç) | B) Hetzner Object Storage (S3 uyumlu) |
|---|---|---|
| Konum | `/srv/kornne/shared/media/originals` (release dışında, `MEDIA_DIR` ile route'a; `public/upload` symlink) | Bucket `kornne-media` (Falkenstein/Nuremberg), Next `images.remotePatterns` |
| Maliyet | VPS diskine dahil (106,6 MB ≈ ihmal) | Bugünkü fiyatlandırmada küçük sabit aylık ücret + trafik (güncel tarife Hetzner'den teyit edilmeli) |
| Operasyon | En basit; Nginx doğrudan statik servis edebilir | SDK/credential yönetimi, CORS, imzalı yükleme; çoklu sunucuda avantaj |
| Yedek | Günlük `restic`/`rsync` → **Hetzner Storage Box** (SFTP/rsync/BorgBackup; **S3 değildir**) + haftalık bütünlük (`verify-media`) | Bucket versioning + başka bölgeye periyodik kopya |
| Geçiş | Admin yükleme (S6) aynı dizine yazar | Admin yükleme doğrudan bucket'a |
| Ne zaman | Tek VPS, < birkaç GB medya | Çok sunucu / CDN / büyük video arşivi |

**Öneri:** A ile başla (tek VPS, küçük set); `MediaAsset.storageKey` soyut olduğundan ileride B'ye taşımak yalnız dosya kopyası + `MEDIA_DIR`/loader değişikliği gerektirir. Storage Box yalnız yedek hedefi olarak kullanılmalı.

## Google ürün görseli kalite kontrolü (S8/S9'da)

- 9 ürünün **ana** görseli 500×500 altında; WhatsApp/IMG adlı fotoğraflar; bazı görsellerde logolu vitrin/filigran olasılığı (ör. `Kornne-Kurban-Ekipman-Logolu-Vitrin.png` site görseli, ürün ana görseli değil) — Merchant için ana görsel filigransız, promosyonsuz olmalı.
- Alt metinler otomatik taslak (yalnız TR, 114); editör onayı ve EN/FR alt'ları eşleşme onayıyla gelir.
- Görsel sitemap (`sitemap.ts` images alanı) indekslemeye geçişte aktif olur.
