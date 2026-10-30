import { SITE } from "@/config/site";

/**
 * Site settings (Admin › Ayarlar). `publicWhen`:
 *  - "always"   — contact data already published on kornne.com (shown as before, marked unverified internally)
 *  - "verified" — company / legal / commercial facts: shown on the storefront ONLY after a super admin marks them
 *                 VERIFIED with a source
 *  - "never"    — internal (bank accounts, notification recipient, retention policy draft) — never rendered publicly
 */
export type SettingDef = { label: string; group: "contact" | "social" | "company" | "commerce" | "merchant" | "operations"; kind: "text" | "textarea" | "email" | "tel" | "url" | "number"; publicWhen: "always" | "verified" | "never"; hint?: string; seed?: string };

export const SETTING_DEFS = {
  "contact.phoneDisplay": { label: "Telefon (görünen)", group: "contact", kind: "tel", publicWhen: "always", seed: SITE.phoneDisplay },
  "contact.phoneE164": { label: "Telefon (arama bağlantısı, +90…)", group: "contact", kind: "tel", publicWhen: "always", seed: SITE.phoneE164 },
  "contact.email": { label: "E-posta", group: "contact", kind: "email", publicWhen: "always", seed: SITE.email },
  "contact.whatsapp": { label: "WhatsApp numarası (yalnız rakam, ülke koduyla)", group: "contact", kind: "tel", publicWhen: "always", seed: SITE.whatsappE164 },
  "contact.address": { label: "Adres", group: "contact", kind: "textarea", publicWhen: "always", seed: `${SITE.address.street}, ${SITE.address.locality}/${SITE.address.region}` },
  "social.instagram": { label: "Instagram", group: "social", kind: "url", publicWhen: "always", seed: SITE.social[0].url },
  "social.facebook": { label: "Facebook", group: "social", kind: "url", publicWhen: "always", seed: SITE.social[1].url },
  "social.youtube": { label: "YouTube", group: "social", kind: "url", publicWhen: "always", seed: SITE.social[2].url },
  "company.legalName": { label: "Ticari unvan", group: "company", kind: "text", publicWhen: "verified", hint: "Kaynak sitede iki farklı yazım var; müşteri teyidi gerekli." },
  "company.taxOffice": { label: "Vergi dairesi", group: "company", kind: "text", publicWhen: "verified" },
  "company.taxId": { label: "Vergi numarası", group: "company", kind: "text", publicWhen: "verified" },
  "company.mersis": { label: "MERSİS no", group: "company", kind: "text", publicWhen: "verified" },
  "commerce.vatPolicy": { label: "KDV politikası (dahil/hariç, oran)", group: "commerce", kind: "textarea", publicWhen: "never", hint: "Ödeme kapısını AÇMAZ — kapı yalnız sunucu ortam ayarlarıyla ve tüm ön koşullarla açılır." },
  "commerce.shippingPolicy": { label: "Kargo / nakliye kuralları", group: "commerce", kind: "textarea", publicWhen: "verified" },
  "commerce.installationPolicy": { label: "Kurulum / montaj koşulları", group: "commerce", kind: "textarea", publicWhen: "verified" },
  "commerce.bankAccounts": { label: "Banka hesapları (IBAN)", group: "commerce", kind: "textarea", publicWhen: "never", hint: "Bu sprintte vitrinde hiçbir koşulda gösterilmez." },
  // Sprint 9 — Google Merchant target (from the EXISTING account; nothing is created or changed on Google's side)
  "merchant.accountId": { label: "Merchant Center hesap no", group: "merchant", kind: "text", publicWhen: "never", hint: "Mevcut hesaptan salt-okunur teyit edilecek. Kayıt bağlantı KURMAZ." },
  "merchant.dataSourceId": { label: "Merchant API veri kaynağı (dataSource) no", group: "merchant", kind: "text", publicWhen: "never", hint: "Mevcut feed'i bozmamak için ayrı bir API veri kaynağı önerilir — müşteri kararı." },
  "merchant.targetCountry": { label: "Hedef ülke (ISO 3166, ör. TR)", group: "merchant", kind: "text", publicWhen: "never" },
  "merchant.contentLanguage": { label: "İçerik dili (ISO 639-1, ör. tr)", group: "merchant", kind: "text", publicWhen: "never" },
  "merchant.feedLabel": { label: "feedLabel (ör. TR)", group: "merchant", kind: "text", publicWhen: "never", hint: "Mevcut ürünlerle aynı offerId/feedLabel/dil üçlüsü kullanılmazsa yinelenen ürün oluşur." },
  "operations.quoteNotificationEmail": { label: "Teklif bildirimi alıcı e-postası", group: "operations", kind: "email", publicWhen: "never", hint: "E-posta sağlayıcısı tanımlanana kadar gönderim yapılmaz; bildirimler 'Bekliyor' kalır." },
  "operations.quoteRetentionDays": { label: "Teklif saklama süresi (gün) — TASLAK", group: "operations", kind: "number", publicWhen: "never", seed: "730", hint: "Hukuki onay olmadan otomatik silme/anonimleştirme çalışmaz." },
} as const satisfies Record<string, SettingDef>;

export type SettingKey = keyof typeof SETTING_DEFS;
export const SETTING_KEYS = Object.keys(SETTING_DEFS) as SettingKey[];
export const isSettingKey = (k: string): k is SettingKey => k in SETTING_DEFS;

export const GROUP_LABELS: Record<SettingDef["group"], string> = {
  contact: "İletişim",
  social: "Sosyal medya",
  company: "Firma kimliği",
  commerce: "Ticari koşullar",
  merchant: "Google Merchant hedefi",
  operations: "Operasyon",
};

/** Validates a value for its kind; returns an error message or null. */
export function settingProblem(key: SettingKey, value: string): string | null {
  const def: SettingDef = SETTING_DEFS[key];
  if (value.length > 4000) return "En fazla 4000 karakter.";
  if (!value) return null;
  if (def.kind === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) return "Geçerli bir e-posta girin.";
  if (def.kind === "url" && !/^https:\/\/[^\s]+$/.test(value)) return "https:// ile başlayan bir adres girin.";
  if (def.kind === "number" && !/^\d{1,5}$/.test(value)) return "Sayı girin.";
  if (key === "contact.phoneE164" && !/^\+\d{8,15}$/.test(value)) return "+ ve ülke koduyla girin (örn. +905…).";
  if (key === "contact.whatsapp" && !/^\d{8,15}$/.test(value)) return "Yalnız rakam, ülke koduyla (örn. 905…).";
  return null;
}
