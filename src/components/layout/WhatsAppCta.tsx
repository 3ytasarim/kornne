import { SITE } from "@/config/site";
import { cn } from "@/lib/cn";

/** wa.me link builder (Mezbaha src/lib/whatsapp.ts pattern). Number from settings; message localized. */
export function whatsappHref(message?: string, number: string = SITE.whatsappE164): string {
  return `https://wa.me/${number.replace(/D/g, "")}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
}

export function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn("fill-current", className)}>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.87 9.87 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91A9.85 9.85 0 0 0 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.23 8.23 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24a8.2 8.2 0 0 1 5.83 2.42 8.18 8.18 0 0 1 2.41 5.83c0 4.55-3.7 8.24-8.25 8.24Zm4.52-6.17c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.44.12-.14.16-.25.25-.41.08-.17.04-.31-.02-.44-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.42h-.48c-.17 0-.44.06-.66.31-.23.25-.87.85-.87 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.24 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.1-.23-.16-.48-.29Z" />
    </svg>
  );
}

/** Floating WhatsApp CTA (bottom end corner → bottom-left in Arabic). */
export function WhatsAppFab({ label, message, number }: { label: string; message: string; number?: string }) {
  return (
    <a
      href={whatsappHref(message, number)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      data-wa-fab data-analytics-location="floating_button" className="fixed end-4 bottom-4 z-30 inline-flex size-14 items-center justify-center rounded-full bg-whatsapp text-white shadow-[var(--shadow-pop)] transition-transform duration-200 hover:scale-105 focus-visible:scale-105 md:end-6 md:bottom-6"
    >
      <WhatsAppIcon className="size-7" />
    </a>
  );
}
