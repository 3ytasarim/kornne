# İçerik yönetimi kılavuzu (müşteri için)

Panel adresi `/admin`. Hesabınızı Süper Yönetici davet bağlantısıyla oluşturur. Varsayılan bir şifre yoktur.

## Kim ne yapabilir?

| Rol | İçerik yazma | Yayınlama | Menü, SSS, duyuru |
|---|---|---|---|
| SEO / İçerik Editörü | ✓ | — (incelemeye gönderir) | düzenler; yayın için onaya gönderir |
| Yönetici, Süper Yönetici | ✓ | ✓ | ✓ |

## Sayfa ve blog yazısı

1. **Yeni içerik:** `İçerik › Yeni içerik`. Tür seçin (kurumsal sayfa, bilgi sayfası, yasal metin, blog), bir iç anahtar, başlık ve adres girin. İçerik **taslak** olarak oluşur.
2. **Metni yazın.** Araç çubuğu:
   - Kalın, italik, H2/H3, listeler, bağlantı (https, mailto, tel), biçimi temizle.
   - Tablo için "HTML" görünümü.
   - Yapıştırılan metin düz metne çevrilir.
   - Kaydederken güvenlik filtresi betik, olay öznitelikleri ve `javascript:` bağlantılarını kaldırır. Kaldırma olursa uyarılırsınız.
3. **Kaydedin:** "Taslağı kaydet". Her kayıt bir **sürümdür**; isterseniz kısa bir sürüm notu yazın.
4. **Önizleyin:** "Taslağı önizle". Önizleme yalnız panel kullanıcılarına açıktır.
5. **Yayınlayın:**
   - Editörler "İncelemeye gönder"e basar; içerik "Yayın onayı bekliyor" olur.
   - Yönetici "Yayınla" → "Son sürümü yayınla" ile yayına alır.
   - **Yayındaki sayfayı düzenlemek canlı sayfayı hemen değiştirmez.** Yeni sürüm yayınlanana kadar ziyaretçi eski sürümü görür; ekranda "Değişiklikleri yayınla" düğmesi çıkar.
6. **Adres değişikliği:** yeniden yayınlarken adresi değiştirirseniz eski adres otomatik olarak 301 ile yeni adrese yönlenir.
7. **Geri alma:**
   - Sürüm geçmişinden eski bir sürümü "Geri yükle" ile çalışma kopyasına alın, sonra yeniden yayınlayın.
   - "Yayından kaldır (taslağa al)" sayfayı o dilde kapatır; adres 404 verir ve menü bağlantısı kendiliğinden gizlenir.
   - "Arşivle" içeriği tüm dillerde kaldırır.
8. **Diller:** her dil ayrı bir sekmedir ve kendi başlığı, adresi, metni ve SEO alanları vardır. Bir dilde metin yoksa boş bırakın: vitrin Türkçe metni "çeviri yok" uyarısıyla gösterir ve o sayfayı indekslemez. Uydurma çeviri eklemeyin.
9. **Yasal metinler:** "hukuken onaylı" ibaresi ancak Süper Yönetici, onay referansını yazarak "Hukuken onaylandı olarak işaretle" dediğinde çıkar. O zamana kadar sayfada "hukuki onay sürecindedir" uyarısı görünür ve sayfa indekslenmez.

## SSS ve ürün soru-cevap

- **Yer:** `İçerik › SSS / Soru-cevap`, dil sekmeleriyle.
- **Gösterim yeri:** genel SSS sayfası veya bir ürünün sayfası.
- **Yayın şartı:** cevabın **kaynağı** yazılmadan yayınlanamaz (teknik föy, firma beyanı…). Bu kural, AI asistanlarının alıntıladığı bilgilerin doğru olması (GEO) içindir.
- **Vitrine etkisi:** o dilde yayında soru varsa menüde "SSS" bağlantısı ve sayfada `FAQPage` yapılandırılmış verisi otomatik çıkar; yoksa sayfa 404 verir ve bağlantı gizlenir.
- **Editör düzenlemesi:** yayın yetkisi olmayan editörün düzenlediği soru "onay bekliyor" durumuna düşer.

## Duyuru / banner

- **Yerler:** ana sayfa şeridi veya üst şerit (tüm sayfalar).
- **Görünme koşulu:** duyuru yalnız **durumu "Yayında" ve şu anki zaman başlangıç–bitiş aralığındaysa** görünür. Yayın için **bitiş tarihi zorunludur**; süresi geçmiş kampanya açık kalamaz. Tarihler İstanbul saatiyle girilir.
- **Diller:** metni olmayan dilde duyuru gösterilmez.
- **İçerik kuralı:** fiyat veya indirim içeren kampanya duyurusu yalnız doğrulanmış fiyatla yapılır.

## Menü ve footer

- **Konumlar:** üst menü (Ürünler'den sonra), footer kurumsal, footer yasal.
- **Hedefler:** içerik sayfası, kategori veya adres (site içi `/…` ya da `https://…`).
- **Etiketler:** her dil için ayrı; boş bırakılan dilde Türkçe etiket kullanılır.
- **Gizlenen bağlantılar:** o dilde yayında olmayan sayfanın bağlantısı gösterilmez. Türkçe-only yasal metinler Türkçe sayfaya bağlanır. `/blog` ve `/sss` bağlantıları yalnız içerik varsa görünür.

## İletişim ve firma bilgileri

`Ayarlar` ekranı tek kaynaktır. Telefon, e-posta, WhatsApp, adres ve sosyal medya başlıkta, footer'da, iletişim sayfasında ve yapılandırılmış veride aynı değeri kullanır.

- **Görünürlük:** iletişim bilgileri eski sitede yayında olduğu için gösterilir. Ticari unvan, vergi ve kargo/kurulum koşulları ise **Süper Yönetici kaynağıyla doğrulayana kadar** vitrine çıkmaz.
- **Gizli kalanlar:** banka hesapları ve bildirim alıcısı hiçbir koşulda vitrinde gösterilmez.
- **Yeniden doğrulama:** bir değeri değiştirmek o değeri yeniden "doğrulanmadı" yapar.

## Bilerek açılmayanlar

- **Online sepet ve ödeme:** panelde açma düğmesi yoktur; sunucu ayarları ve tüm ticari onaylar gerekir.
- **E-posta/SMS bildirimleri:** sağlayıcı tanımlı değil; bildirimler kuyrukta "bekliyor" görünür.
- **Merchant Center, Search Console, GA4:** bağlı değil. `Merchant hazırlık` ekranı yalnız eksik listesini gösterir.
