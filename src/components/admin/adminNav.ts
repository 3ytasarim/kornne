import type { AdminModule } from "@/lib/auth/rbac";

/**
 * Admin information architecture. `state` is the honest module status shown in the docs / dashboard:
 * live = working CRUD on Neon · partial = works with stated limits · prep = read-only preparation · blocked = waits for
 * client approvals / provider accounts.
 */
export type NavItem = { module: AdminModule; href: string; label: string; icon: string; state: "live" | "partial" | "prep" | "blocked"; description: string };

export const ADMIN_NAV: { group: string; items: NavItem[] }[] = [
  { group: "Genel", items: [{ module: "dashboard", href: "/admin", label: "Panel", icon: "Gauge", state: "live", description: "Canlı sayımlar, bekleyen kararlar, veri kalitesi" }] },
  {
    group: "Katalog",
    items: [
      { module: "products", href: "/admin/products", label: "Ürünler", icon: "Package", state: "live", description: "İçerik, durum, kategori, seçenek, görsel, teknik bilgi, doküman, geçmiş" },
      { module: "products", href: "/admin/categories", label: "Kategoriler", icon: "FolderTree", state: "live", description: "Dil bazlı ad, adres, açıklama, SEO" },
      { module: "products", href: "/admin/catalog-qa", label: "Katalog QA", icon: "ClipboardCheck", state: "live", description: "Aktarım sayıları, gizli ürünler, fiyat/indirim sorunları, kırık medya" },
      { module: "pricing", href: "/admin/pricing", label: "Fiyatlar", icon: "BadgeTurkishLira", state: "live", description: "Fiyat önerisi, dört göz onayı, geçmiş, çelişki/indirim filtreleri" },
      { module: "inventory", href: "/admin/inventory", label: "Stok", icon: "Boxes", state: "prep", description: "Kaynakta stok verisi yok (salt okunur)" },
      { module: "media", href: "/admin/media", label: "Medya", icon: "Images", state: "live", description: "445 orijinal, alt metin, kullanım, güvenli yükleme" },
    ],
  },
  {
    group: "Satış",
    items: [
      { module: "quotes", href: "/admin/quotes", label: "Teklif talepleri", icon: "MessagesSquare", state: "live", description: "CRM: durum, sorumlu, iç not, takip, dışa aktarma" },
      { module: "customers", href: "/admin/customers", label: "Müşteriler", icon: "Users", state: "partial", description: "Teklif kişileri (maskeli liste, denetimli detay)" },
      { module: "orders", href: "/admin/orders", label: "Siparişler", icon: "ShoppingBag", state: "partial", description: "EFT/Havale siparişleri, ödeme bildirimi, ödeme onayı, durum (canlıda satış kapısı ön koşullara bağlı)" },
    ],
  },
  {
    group: "İçerik & SEO",
    items: [
      { module: "content", href: "/admin/content", label: "İçerik", icon: "FileText", state: "live", description: "Sayfa, blog, SSS, banner, menü/footer — taslak/onay/yayın" },
      { module: "translations", href: "/admin/translations", label: "Çeviriler", icon: "Languages", state: "live", description: "5 dil kapsamı, EN/FR eşleşme kararları" },
      { module: "seo", href: "/admin/seo", label: "SEO / GEO", icon: "Search", state: "partial", description: "URL denetimi, görsel SEO, GEO önerileri, kanonik/hreflang" },
      { module: "redirects", href: "/admin/redirects", label: "Yönlendirmeler", icon: "Route", state: "partial", description: "125 eski URL (salt okunur), döngü/zincir kontrolü" },
      { module: "merchant", href: "/admin/merchant", label: "Merchant Center", icon: "Store", state: "partial", description: "Uygunluk motoru, feed önizleme, API adaptörü — BAĞLI DEĞİL" },
    ],
  },
  {
    group: "Sistem",
    items: [
      { module: "settings", href: "/admin/bank-accounts", label: "Banka hesapları", icon: "Landmark", state: "live", description: "EFT/Havale IBAN’ları (doğrulamalı), sitede gösterim" },
      { module: "settings", href: "/admin/settings", label: "Ayarlar", icon: "Settings", state: "partial", description: "Firma/iletişim (doğrulama), ödeme kapısı durumu, saklama taslağı" },
      { module: "settings", href: "/admin/analytics", label: "Analitik & izin", icon: "ChartLine", state: "prep", description: "GA4/GTM/Search Console yapılandırma durumu, olay planı, çerez izni — BAĞLI DEĞİL" },
      { module: "users", href: "/admin/users", label: "Kullanıcılar", icon: "UserCog", state: "live", description: "Davet, rol, pasifleştirme, oturumlar" },
      { module: "audit", href: "/admin/audit", label: "Denetim kaydı", icon: "ScrollText", state: "live", description: "Tüm yönetici işlemleri" },
    ],
  },
];

export const ALL_NAV_ITEMS = ADMIN_NAV.flatMap((g) => g.items);
