/**
 * Company / contact data shown on the storefront. Every value here was read from the public kornne.com pages
 * (captured 2026-10-21) and is still UNVERIFIED — legal name, phones and addresses differ between the legal pages
 * (docs/audit/data-quality.md). Admin "Settings" replaces this file in Sprint 6.
 */
export const SITE = {
  name: "KORNNE",
  /** Shown in the legacy JSON-LD brand field; two spellings exist on the source site (unverified) */
  legalNameCandidates: ["KORNNE MEZBAHA TEKNOLOJİLERİ", "KORNNE"],
  email: "info@kornne.com",
  phoneDisplay: "+90 535 406 80 02",
  phoneE164: "+905354068002",
  whatsappE164: (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "905354068002").replace(/\D/g, ""),
  address: {
    street: "S.S. İstanbul Mermerciler Sanayi Sitesi 22. Sokak No: 15, Köseler Mahallesi",
    locality: "Dilovası",
    region: "Kocaeli",
    country: "TR",
  },
  social: [
    { name: "Instagram", url: "https://www.instagram.com/KornneTech" },
    { name: "Facebook", url: "https://www.facebook.com/KornneTech" },
    { name: "YouTube", url: "https://www.youtube.com/@KornneTech" },
  ],
  /** Original logo file, byte-identical copy of https://kornne.com/upload/Kornne_Logo.png (500×500 PNG) */
  logo: { src: "/brand/kornne-logo.png", width: 500, height: 500 },
  /** Client-supplied wordmark (23.10.2026, 750×200 WebP, navy on transparent) + white derivative for dark surfaces */
  wordmark: { src: "/brand/kornne-wordmark.webp", srcWhite: "/brand/kornne-wordmark-white.webp", width: 750, height: 200 },
} as const;

export const verifiedFlags = {
  /** Flip to true only after the client confirms the values above (Sprint 6 settings) */
  contactVerified: false,
};
