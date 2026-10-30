"use client";

import { Sparkles } from "lucide-react";
import { buttonClass } from "@/components/ui/Button";

/**
 * Fills the SEO title/description inputs of the surrounding form with suggestions built from the product's own
 * content (src/lib/seo/suggest.ts). Only the form fields change — nothing is saved until the editor clicks "Kaydet".
 * Fires input events so the live length hints update.
 */
export function SeoSuggestButton({ titleId, descId, suggestion }: { titleId: string; descId: string; suggestion: { seoTitle: string; seoDescription: string } }) {
  const set = (id: string, value: string) => {
    const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null;
    if (!el) return;
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  return (
    <button
      type="button"
      className={buttonClass("secondary", "sm")}
      onClick={() => {
        set(titleId, suggestion.seoTitle);
        set(descId, suggestion.seoDescription);
        document.getElementById(titleId)?.focus();
      }}
    >
      <Sparkles aria-hidden="true" className="size-4" />
      Önerileri doldur
    </button>
  );
}
