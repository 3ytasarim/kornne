import { cn } from "@/lib/cn";

/**
 * Small inline SVG flags for the language switcher (TR, GB, DE, FR, RU and the pan-Arab tricolour for Arabic, as on the
 * legacy kornne.com language bar). Decorative — the language name is always next to it as text.
 */
export function Flag({ locale, className }: { locale: string; className?: string }) {
  const cls = cn("inline-block h-[0.9em] w-[1.35em] shrink-0 overflow-hidden rounded-[2px] shadow-[0_0_0_1px_rgb(0_0_0/0.12)]", className);
  switch (locale) {
    case "tr":
      return (
        <svg aria-hidden="true" viewBox="0 0 30 20" className={cls}>
          <rect width="30" height="20" fill="#E30A17" />
          <circle cx="11.25" cy="10" r="5" fill="#fff" />
          <circle cx="12.5" cy="10" r="4" fill="#E30A17" />
          <path fill="#fff" d="m16.2 10 4.5-1.46-2.78 3.83V7.63l2.78 3.83z" />
        </svg>
      );
    case "en":
      return (
        <svg aria-hidden="true" viewBox="0 0 60 30" className={cls} preserveAspectRatio="xMidYMid slice">
          <clipPath id="flag-gb-t">
            <path d="M30 15h30v15zv15H0zH0V0zV0h30z" />
          </clipPath>
          <path d="M0 0v30h60V0z" fill="#012169" />
          <path d="M0 0l60 30m0-30L0 30" stroke="#fff" strokeWidth="6" />
          <path d="M0 0l60 30m0-30L0 30" clipPath="url(#flag-gb-t)" stroke="#C8102E" strokeWidth="4" />
          <path d="M30 0v30M0 15h60" stroke="#fff" strokeWidth="10" />
          <path d="M30 0v30M0 15h60" stroke="#C8102E" strokeWidth="6" />
        </svg>
      );
    case "de":
      return (
        <svg aria-hidden="true" viewBox="0 0 5 3" className={cls}>
          <rect width="5" height="1" fill="#000" />
          <rect y="1" width="5" height="1" fill="#DD0000" />
          <rect y="2" width="5" height="1" fill="#FFCE00" />
        </svg>
      );
    case "fr":
      return (
        <svg aria-hidden="true" viewBox="0 0 3 2" className={cls}>
          <rect width="1" height="2" fill="#002654" />
          <rect x="1" width="1" height="2" fill="#fff" />
          <rect x="2" width="1" height="2" fill="#CE1126" />
        </svg>
      );
    case "ru":
      return (
        <svg aria-hidden="true" viewBox="0 0 3 2" className={cls}>
          <rect width="3" height="2" fill="#fff" />
          <rect y="0.667" width="3" height="0.667" fill="#0039A6" />
          <rect y="1.333" width="3" height="0.667" fill="#D52B1E" />
        </svg>
      );
    case "ar":
      return (
        <svg aria-hidden="true" viewBox="0 0 6 4" className={cls}>
          <rect width="6" height="4" fill="#fff" />
          <rect width="6" height="1.333" fill="#000" />
          <rect y="2.667" width="6" height="1.333" fill="#007A3D" />
          <path d="M0 0l2.5 2L0 4z" fill="#CE1126" />
        </svg>
      );
    default:
      return null;
  }
}
