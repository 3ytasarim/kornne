# Import Runbook — kornne.com → KORNNE (Neon)

Kod: `scripts/import/legacy-import.ts` · saf plan `scripts/import/lib/plan.ts` · geri alma `scripts/import/rollback.ts`. Raporlar `data/import-runs/*.json` (gitignore — ham veri içerir).

## Ön koşullar

1. `.env` → `DATABASE_URL` (pooler) ve `DIRECT_URL` (pooler'sız; importer **yalnız DIRECT_URL** kullanır — Neon pooler'da uzun etkileşimli transaction riski).
2. Hedefi doğrula (salt-okunur, şifre yazmaz): `npm run db:identity` → endpoint / branch / tablo sayıları.
3. Şema güncel mi: `npx prisma migrate status` → "Database schema is up to date". **Asla** `migrate reset`, `db push --force-reset`, `migrate dev` (shadow DB) kullanma. Yeni migration: `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script -o prisma/migrations/<ts>_<ad>/migration.sql` → incele → `prisma migrate deploy`.
4. Kaynak artefaktlar güncel: `npm run audit:all` (tarama verisinden snapshot + CSV'ler), medya: `node scripts/verify-media.mjs`.

## Dry-run (varsayılan, hiçbir şey yazmaz)

```bash
npm run import:legacy
```

Aynı kod yolu çalışır ama hiçbir INSERT/UPDATE gönderilmez; çıktı: önce/sonra sayımları (eşit olmalı), varlık başına `create / update / unchanged / skippedEdited / conflict`, bütünlük kontrolleri (yinelenen anahtar/slug, eksik görsel/fiyat, hatalı indirim, mojibake, NFC, eşleşme güven dağılımı).

## Apply (yalnız onaylı hedefe)

```bash
npm run import:legacy -- --apply --confirm-db=<endpoint-id>
```

- `--confirm-db` değeri `DIRECT_URL` host'unun endpoint'iyle birebir eşleşmezse betik **reddeder** (yanlış DB'ye yazma koruması).
- Tek **Serializable** transaction; hata olursa hiçbir şey yazılmaz.
- Sonunda `ImportRun` satırı: özet + oluşturulan her satırın kimliği (`createdRefs`).

## Tekrar çalıştırma davranışı (idempotent)

| Varlık | Var olan kayıtta |
|---|---|
| Product | dokunulmaz (yayın/görünürlük ilk importtan sonra editörün) |
| Product/Category translation, alt metin | yalnız `importChecksum` hâlâ satırın kendi değerleriyle eşleşiyorsa (kimse düzenlememiş) güncellenir; aksi halde **skippedEdited** |
| Price | append-only; aynı ham fiyat → unchanged; kaynak değiştiyse yeni UNVERIFIED satır; admin fiyatı varsa **hiç** eklenmez |
| Link tabloları | yalnız eksik bağ eklenir, mevcut bağ silinmez |
| MediaAsset | SHA-256 farklıysa **conflict** raporlanır, üzerine yazılmaz |
| Match suggestion | karar verilmiş öneriye dokunulmaz |
| Redirect | yalnız eksik satır eklenir; admin satırları dokunulmaz |

## Geri alma

```bash
npm run import:rollback -- --run=<ImportRun id>                          # neyin silineceğini gösterir
npm run import:rollback -- --run=<ImportRun id> --apply --confirm-db=<endpoint-id>
```

Yalnız o çalıştırmanın **oluşturduğu** satırlar, bağımlılık sırasının tersine, tek transaction'da silinir; run `ROLLED_BACK` olur. Güncellemeler geri alınmaz (rapor before/after içerir). Ek güvence: Neon point-in-time restore (plan limitine göre) — prod öncesi `pg_dump` yedeği S11'de.

## 22 Ekim 2026 çalıştırmaları (gerçek)

| Zaman (UTC) | Mod | Sonuç |
|---|---|---|
| 23:15:57 | dry-run | önce=0 / sonra=0; plan: 41 ürün, 4 kategori, 20 kategori çevirisi, 445 medya, 118 ürün-medya, 118 alt metin (plan), 79 ürün-kategori, 2 varyant, 41 fiyat, 41 stok, 594 köken, 74 eşleşme, 125 yönlendirme |
| 23:16:16 | **apply** `cmviqezv6016udkp6luei3vwv` | sonra: 41 / 41 / 4 / 20 / 79 / 445 / **114** alt metin / 118 / 2 / 41 / 41 / 594 / 74 / 125 |
| 23:17:13 | dry-run | **0 create, 0 update, 1743 unchanged** |
| 23:17:35 | apply `cmviqg53g00008cp6zelxpuzw` | **0 create, 0 update, 1743 unchanged**; sayımlar aynı |
| 23:26 / 23:49 / son kontrol | dry-run | 0 değişiklik (checksum kodu taşındıktan ve Sprint 3 sonrası) |

**Dry-run ↔ apply farkı:** plan 118 alt metin öngördü, apply 114 oluşturdu — 4 görsel iki üründe ortak (ör. Balansör #110/#217 aynı foto); alt metin görsel başına tektir, ilk ürünün başlığı kullanıldı. Diğer tüm sayılar birebir.

## Doğrulama sonrası

- `npx vitest run tests/integration` — DB ↔ plan sayımları, anahtarlar, fiyat durumu, #208 gizliliği, medya hash'leri, Türkçe karakterler.
- `node scripts/verify-media.mjs` — 445 satır ↔ orijinal ↔ sunulan kopya SHA-256.
