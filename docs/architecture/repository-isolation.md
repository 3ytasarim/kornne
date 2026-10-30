# Depo İzolasyonu — KORNNE'nin PestShield deposundan ayrılması

**Tarih:** 22 Ekim 2026 · **Durum:** Tamamlandı ve doğrulandı. Eski klasör **silinmedi, değiştirilmedi.**

## Başlangıç durumu (ölçülen)

| Öğe | Değer |
|---|---|
| Eski çalışma dizini | `eski çalışma klasörü (KORNNE)` |
| `git rev-parse --show-toplevel` | `üst depo (PestShield)` (PestShield deposu) |
| `git status --short` (KORNNE ile ilgili) | `?? KORNNE/` (izlenmeyen) · ayrıca ` M launch.json (geliştirme aracı yapılandırması)` |
| Kopyalanan dosya | 1296 dosya, 223,72 MB (`node_modules`, `.next`, `test-results` hariç — yeniden üretilebilir) |
| Orijinal medya | `data/source-media/originals/` 445 dosya · `public/upload/` 445 dosya |

## Yeni bağımsız çalışma alanı

- **Yol:** `D:\Projects\kornne` — `D:\Projects` bir Git deposu değil, PestShield ağacının dışında; içinde yalnız başka bağımsız bir proje (`german-auto-platform`) var. Hedef klasör kopyadan önce **yoktu** (üzerine yazılmadı).
- **Kopya:** `robocopy /E /COPY:DAT /DCOPY:DAT /XD node_modules .next test-results` → 1296 dosya kopyalandı, 0 hata.
- **Doğrulama:** `node scripts/verify-copy.mjs <kaynak> <hedef>` — her dosyanın SHA-256 + boyutu karşılaştırıldı. Sonuç `docs/architecture/evidence/isolation-verify.json`:
  - kaynak 1296 / hedef 1297 dosya (fazladan olan yalnız yeni yazılan `scripts/verify-copy.mjs`)
  - **eksik 0, içerik farkı 0**, `identical: true`
  - orijinal medya 445 = 445, sunulan medya 445 = 445, `.env` her iki tarafta mevcut
- **Bağımlılıklar:** `npm ci` (lockfile'dan birebir) + `prisma generate`.
- **Git:** `git init -b main` — **commit yok, remote yok, push yok.** Depo-yerel kullanıcı `3ytasarim` (AI imzası yok).
- **`.gitignore`:** `.env`, `.env.*` (yalnız `.env.example` hariç), `node_modules/`, `.next/`, `*.pem/*.key/*.p12`, `*.dump`, `*.sql.gz`, `*.backup`, `backups/`, `data/source-media/`, `public/upload/`, `data/source-crawl/html/`, `data/import-runs/`, test çıktıları. `git check-ignore` ile doğrulandı.

## Ek medya kontrolü

`node scripts/verify-media.mjs` — DB'deki 445 `MediaAsset` satırı ↔ `data/source-media/originals` ↔ `public/upload`: **tüm SHA-256 değerleri eşit, eksik dosya yok** (`ok: true`).

## PestShield deposunda yapılanlar

- Sprint 1'de PestShield'in `launch.json (geliştirme aracı yapılandırması)` dosyasına eklediğim **"KORNNE (next start, prod build)"** girdisi bu sprintte **geri alındı** (yalnız o girdi; dosyadaki diğer oturumlara ait değişikliklere dokunulmadı).
- Başka hiçbir PestShield dosyası değiştirilmedi; commit/stash/reset yapılmadı.

## Eski klasör

`eski çalışma klasörü (KORNNE)` olduğu gibi duruyor (Sprint 0+1 halinin yedeği). Silinmesi **sizin kararınız**; önerim: yeni dizinde ilk commit atılıp bir yedeği (ör. özel GitHub deposu) alındıktan sonra silmek. Silmeden önce `node D:\Projects\kornne\scripts\verify-copy.mjs "eski çalışma klasörü (KORNNE)" "D:/Projects/kornne"` ile son bir karşılaştırma yapılabilir (yeni dizinde Sprint 2+3 dosyaları "extra" olarak listelenir; "missing/differ" boş olmalı — eski klasörde sonradan değişen dosya yoksa).

## Bu sprintte çalışma

Sprint 2+3'ün tüm işleri yalnızca `D:\Projects\kornne` içinde yapıldı.
