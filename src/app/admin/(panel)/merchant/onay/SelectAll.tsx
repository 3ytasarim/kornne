"use client";

/** Header checkbox that toggles every `productId` checkbox of its form (progressive: rows stay usable without JS). */
export function SelectAll({ form }: { form: string }) {
  return (
    <input
      type="checkbox"
      aria-label="Tüm ürünleri seç"
      className="size-5 accent-brand-700"
      onChange={(e) => {
        const f = document.getElementById(form);
        f?.querySelectorAll<HTMLInputElement>('input[name="productId"]').forEach((c) => (c.checked = e.currentTarget.checked));
      }}
    />
  );
}
