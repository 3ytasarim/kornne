# Çeviri ve eşleşme onay raporu (Sprint 7)

## 74 EN/FR eşleşme önerisi: başlangıç ve son durum

| | Sprint 6+7 başı | Sprint 6+7 sonu |
|---|---:|---:|
| Toplam öneri (36 EN + 38 FR) | 74 | 74 |
| Karar bekleyen (SUGGESTED) | 74 | **74** |
| Onaylanan / reddedilen | 0 / 0 | **0 / 0** |
| Düşük güvenli (< 60) | 8 | 8 |
| Fiyatı çelişkili öneri satırı | 20 (11 ürün) | 20 |
| Müşteri kararı gereken | 2 (EN #142, FR #179 — Kurban Yatırma Kabini) | 2 |

**Hiçbir öneri otomatik onaylanmadı.** Testlerde yapılan onay, yayın ve geri alma işlemleri temizlendi:

- EN #140 üzerinde gerçek veriyle yapılan e2e testinin her adımı geri alındı.
- Diğer akışlar yalnız izole `kornne_test` şemasında çalıştırıldı.

## Onay iş akışı

1. **İnceleme:** `/admin/translations/matches`. Filtreler: dil, durum, risk (düşük güven, fiyat çelişkisi, müşteri kararı).
2. **Karşılaştırma:** `/admin/translations/matches/[id]`.
   - Eski EN/FR kaydı: başlık, eski URL, ID, kısa açıklama, ham fiyat, görseller.
   - Önerilen TR ürün: başlık, adres, no, görseller.
   - Güven puanı, ortak görsel sayısı, fiyat farkı uyarısı.
3. **Karar:**
   - **Onay:** `translation.decide` yetkisi (Süper Yönetici, Yönetici, Ürün Editörü). Eski metinden **yayında olmayan bir editör taslağı** oluşturur (`IN_REVIEW`):
     - Metin HTML filtresinden geçer.
     - Fiyat alınmaz.
     - Görsel alt metinleri o dilde "otomatik taslak" olarak eklenir.
     - Eski URL'nin yönlendirmesi **değişmez**.
   - Düşük güvenli onay için "kontrol ettim" kutusu ve en az 10 karakterlik gerekçe gerekir.
   - "Kurban Yatırma Kabini" eşleşmelerinin onayı için **müşteri onayının referansı** gerekir. Kanıtlar: ortak görsel 0, fiyatlar yaklaşık 6,5 kat farklı.
   - **Ret** (gerekçeli), **yeniden açma** (ret geri alınır), **yeniden eşleştirme**: başka bir TR ürüne bağlanır; o dilde sürümü olan ürün seçilemez, gerekçe zorunludur.
4. **Yayın** (`translation.publish`: Süper Yönetici, Yönetici, SEO Editörü): ürünün **Diller** sekmesinde yapılır.
   - Çeviri `APPROVED` olur ve vitrinde sayfası açılır.
   - hreflang bu dili kapsar.
   - Eski EN/FR URL'si yeni sayfaya tek adımda yönlenir; önceki hedef saklanır.
5. **Yayından kaldırma:** çeviri yeniden incelemeye döner, sayfa 404 verir ve eski URL önceki hedefine geri döner.

- **Eşzamanlılık:** onay ve yayın atomiktir; çift tıklama veya eşzamanlı istekte yalnız biri geçer. Bu kural, testlerde bulunan gerçek bir yarış hatasından sonra eklendi.
- **Testler:** `tests/integration/translation-flow.test.ts` (5 test) ve `tests/e2e/sprint3.spec.ts` (gerçek EN #140 ile onay → yayın → kaldırma, sonra geri alma).

## RU / AR

- Kaynak sitede RU ve AR ürün metni **yok**; ürün sayfası **oluşturulmadı**.
- `/ru/produkt/...` ve `/ar/product/...` adresleri 404 verir (e2e testli).
- Dil menüsü ürün için olmayan çeviriye bağlantı vermez; ürün sayfasının dil bağlantıları kategoriye düşer.
- Listelerde Türkçe içerik Türkçe olarak işaretlenir (`lang="tr"`, `hrefLang`).
- RU/AR kurumsal sayfa: eski sitede başlık var, metin yok. Vitrin Türkçe metni "Bu içerik henüz {dil} diline çevrilmedi" uyarısıyla gösterir; bu sayfalar indekslenmez ve hreflang'e girmez.

## Dil kapsamı (sprint sonu, `/admin/translations`)

| Dil | Ürün sayfası | Kategori | CMS sayfası (yayında) | Menü etiketi | Arayüz anahtarları |
|---|---:|---:|---:|---:|---|
| TR | 40/40 | 4/4 | 4 | 8/8 | kaynak |
| EN | 0/40 | 4/4 | 1 (metinsiz → TR) | 8/8 | tam |
| FR | 0/40 | 4/4 | 1 (metinsiz → TR) | 8/8 | tam |
| RU | 0/40 | 4/4 | 1 (metinsiz → TR) | 8/8 | tam |
| AR | 0/40 | 4/4 | 1 (metinsiz → TR) | 8/8 | tam |

**Arayüz metinleri:** EN/FR/RU/AR metinleri bu projede yazıldı (yeni eklenen `cms` bölümü dahil). Ana dili konuşan bir kişinin incelemesi bekleniyor; bu açıkça "inceleme bekliyor" olarak işaretli.

## Dil kalite listesi (müşteri / çevirmen için)

- [ ] 74 eşleşmenin müşteri tarafından gözden geçirilmesi; öncelik 8 düşük güvenli ve 2 "Kurban Yatırma Kabini" eşleşmesi.
- [ ] EN/FR eski metinlerin kalite kontrolü. Metinler eski siteden birebir alınıyor; dil hataları düzeltilmedi.
- [ ] RU ve AR için gerçek ürün çevirileri; sahibi ve kaynağı belirlenmeli.
- [ ] Kurumsal sayfanın EN/FR/RU/AR metinleri; eski sitede boş.
- [ ] Arayüz metinlerinin ana dil kontrolü: AR yön ve terimler, RU çekimler.
- [ ] Görsellerin EN/FR alt metinleri; onaylarla otomatik taslak olarak gelecek, editörce gözden geçirilmeli.
