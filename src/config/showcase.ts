/**
 * Real installation photographs from the legacy kornne.com home slider (public/upload, byte-identical originals,
 * docs/audit/media-inventory.csv kind=site usage=home:tr). Each slide links to the matching catalog product (by legacy
 * Turkish slug) when one exists — only then a price is shown — otherwise to the matching category.
 */
export type ShowcasePhoto = { src: string; alt: string; productSlug?: string; categoryKey?: string };

export const HERO_PHOTOS: ShowcasePhoto[] = [
  { src: "/upload/2.png", alt: "Dairesel Kesim Hücresi", productSlug: "dairesel-kesim-hucresi" },
  { src: "/upload/3.png", alt: "Ayakta Kesim Hücresi", productSlug: "ayakta-kesim-hucresi" },
  { src: "/upload/9.png", alt: "Aktarma Platformu", productSlug: "platformlar" },
  { src: "/upload/4.png", alt: "Hidrolik Deri Yüzme", categoryKey: "robotik-sistemler" },
];

export const GALLERY_PHOTOS: ShowcasePhoto[] = [
  { src: "/upload/10.png", alt: "İç Organ Platformu", productSlug: "platformlar" },
  { src: "/upload/7.png", alt: "Karkas Bölme Testeresi", categoryKey: "mezbaha-ekipmanlari" },
  { src: "/upload/Mezbaha Teknolojileri1.png", alt: "Robotik Sistemler", categoryKey: "robotik-sistemler" },
  { src: "/upload/6.png", alt: "Mekanik Deri Yüzme", categoryKey: "robotik-sistemler" },
  { src: "/upload/8.png", alt: "Ayak Kesme Makası", categoryKey: "mezbaha-ekipmanlari" },
];
