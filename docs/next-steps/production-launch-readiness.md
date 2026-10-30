# Canlıya geçiş — müşteri onayından sonra uygulanacak sıra

> Bu adımlar **müşteri onayı olmadan uygulanmaz**. Her adımın ayrıntısı `docs/deployment/release-and-rollback-runbook.md` içindedir.

1. **Neon parolasını yenileyin (P0):**
   - Neon Console → Roles → `neondb_owner` → Reset.
   - Yeni değer yalnız sunucu `shared/.env.production` (600) ve yerel `.env` dosyalarına yazılır; yazışmalara veya belgeye yazılmaz.
   - Ardından `SECRETS_ROTATION_CONFIRMED=true`.
2. **Hetzner sunucusunu seçin** → salt-okunur denetim (`server-audit-readonly.sh`) → `preflight.sh` 0 engel.
3. **Mod kararı:** Mod A (teklif kataloğu) veya Mod B (fiyatlı satış + Merchant) — `docs/deployment/go-no-go.md`.
4. **Mod A P0'ları:**
   - Teklif bildirim süreci (sağlayıcı + alıcı veya manuel sorumlu)
   - KVKK/çerez/saklama metni onayı
   - Ticari unvan/vergi bilgisi
5. **Staging:** kullanıcı/dizin → Neon staging branch → medya → `release.sh` (dry-run → `--execute`) → Nginx staging → `smoke --mode=staging` → müşteri incelemesi.
6. **DNS hazırlığı:**
   - Tam döküm (MX/SPF/DKIM/DMARC dahil) alınır.
   - A/AAAA TTL 300'e indirilir.
   - Hostinger tam yedeği alınır.
   - Bakım penceresi belirlenir.
7. **Production:** `.env` doldurulur → `release.sh --execute` → certbot → **DNS A/AAAA** değişikliği → `smoke --mode=production` → teklif testi → e-posta (MX) testi.
8. **Search Console:** doğrulama → sitemap gönderimi → URL Denetimi. Analitik yalnız onaylıysa açılır.
9. **İzleme:** 24 saat / 7 gün / 30 gün. Hostinger 30 gün sonra kapatılır.
10. **Mod B (ayrı karar):**
    1. Fiyat, stok, ödeme sandbox, hukuki metinler.
    2. Merchant erişimi → eski item_id eşleme.
    3. Ayrı API veri kaynağıyla 1 ürün testi.
    4. Kademeli genişleme.
