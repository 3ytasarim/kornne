"use client";

import Image from "next/image";
import { useState } from "react";
import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import { ActionForm, FormMessage, SubmitButton } from "@/components/admin/forms";
import { buttonClass } from "@/components/ui/Button";
import { saveProductMediaAction, saveVariantsAction } from "../actions";

type VariantRow = { key: string; id?: string; tr: string; en: string; de: string; fr: string; ru: string; ar: string; active: boolean; sortOrder: number; sourceKey?: string | null };
const LANGS = ["tr", "en", "de", "fr", "ru", "ar"] as const;

/** Options editor: rename / translate / (de)activate existing options, add new ones. No delete (quotes reference them). */
export function VariantsEditor({ productId, initial, disabled }: { productId: string; initial: VariantRow[]; disabled?: boolean }) {
  const [rows, setRows] = useState(initial);
  const add = () => setRows((r) => [...r, { key: `n${Date.now()}`, tr: "", en: "", de: "", fr: "", ru: "", ar: "", active: true, sortOrder: r.length }]);
  return (
    <ActionForm action={saveVariantsAction} className="space-y-4" aria-label="Seçenekler">
      <input type="hidden" name="productId" value={productId} />
      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-line" tabIndex={0} role="region" aria-label="Kaydırılabilir tablo">
        <table className="w-full min-w-[52rem] text-sm">
          <caption className="sr-only">Ürün seçenekleri</caption>
          <thead className="bg-surface-2 text-xs text-steel uppercase">
            <tr>
              <th scope="col" className="px-3 py-2 text-start">Sıra</th>
              {LANGS.map((l) => (
                <th key={l} scope="col" className="px-3 py-2 text-start">
                  {l.toUpperCase()}
                </th>
              ))}
              <th scope="col" className="px-3 py-2 text-start">Aktif</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-line">
                <td className="px-3 py-2">
                  <input type="hidden" name="vrow" value={r.key} />
                  {r.id ? <input type="hidden" name={`v.${r.key}.id`} value={r.id} /> : null}
                  <input name={`v.${r.key}.sortOrder`} type="number" defaultValue={r.sortOrder} aria-label="Sıra" className="min-h-11 w-20 rounded-[var(--radius-sm)] border border-line-strong bg-surface px-2" />
                </td>
                {LANGS.map((l) => (
                  <td key={l} className="px-3 py-2">
                    <input name={`v.${r.key}.${l}`} defaultValue={r[l]} dir={l === "ar" ? "rtl" : undefined} lang={l} aria-label={`Seçenek adı (${l.toUpperCase()})`} required={l === "tr" && !!r.id} className="min-h-11 w-full min-w-28 rounded-[var(--radius-sm)] border border-line-strong bg-surface px-2" />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <input type="checkbox" name={`v.${r.key}.active`} defaultChecked={r.active} aria-label="Aktif" className="size-5 accent-brand-700" />
                  {r.sourceKey ? <span className="ms-2 text-xs text-steel">kaynak</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {disabled ? null : (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={add} className={buttonClass("secondary", "md")}>
            <Plus aria-hidden="true" className="size-4" /> Seçenek ekle
          </button>
          <SubmitButton pendingText="Kaydediliyor…">Seçenekleri kaydet</SubmitButton>
          <FormMessage />
        </div>
      )}
      <p className="text-xs text-steel">Mevcut seçenekler silinmez (teklif kayıtları onlara bağlı); kullanılmayanı pasif yapın. Aktif seçeneği olan üründe vitrinde seçim zorunludur.</p>
    </ActionForm>
  );
}

type MediaItem = { id: string; src: string; alt: string; width: number | null; height: number | null; isPrimary: boolean; small: boolean };

/** Order / primary / detach for product images. Detaching only removes the link; the file and its URL stay. */
export function MediaOrderEditor({ productId, initial, library, disabled }: { productId: string; initial: MediaItem[]; library: { id: string; label: string }[]; disabled?: boolean }) {
  const [items, setItems] = useState(initial);
  const move = (i: number, d: -1 | 1) =>
    setItems((list) => {
      const next = [...list];
      const j = i + d;
      if (j < 0 || j >= next.length) return list;
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  const primary = items.find((m) => m.isPrimary)?.id ?? items[0]?.id;
  return (
    <ActionForm action={saveProductMediaAction} className="space-y-4" aria-label="Ürün görselleri">
      <input type="hidden" name="productId" value={productId} />
      <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((m, i) => (
          <li key={m.id} className="flex gap-3 rounded-[var(--radius-md)] border border-line bg-surface p-3">
            <input type="hidden" name="order" value={m.id} />
            <div className="relative size-20 shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-surface-2">
              <Image src={m.src} alt="" fill sizes="80px" className="object-contain" />
            </div>
            <div className="min-w-0 flex-1 space-y-1 text-xs">
              <p className="line-clamp-2 font-medium text-ink">{m.alt || <span className="text-warning">Alt metin yok</span>}</p>
              <p className="text-steel tabular-nums">
                {m.width ?? "?"}×{m.height ?? "?"} {m.small ? <span className="text-warning">· 500 px altı</span> : null}
              </p>
              <label className="flex min-h-9 items-center gap-2">
                <input type="radio" name="primaryId" value={m.id} defaultChecked={m.id === primary} className="size-4 accent-brand-700" /> Ana görsel
              </label>
              <label className="flex min-h-9 items-center gap-2 text-signal">
                <input type="checkbox" name="remove" value={m.id} className="size-4 accent-signal" /> Üründen ayır
              </label>
            </div>
            <div className="flex flex-col gap-1">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Yukarı taşı: görsel ${i + 1}`} className="inline-flex size-10 items-center justify-center rounded-[var(--radius-sm)] border border-line hover:bg-surface-2 disabled:opacity-30">
                <ArrowUp aria-hidden="true" className="size-4" />
              </button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label={`Aşağı taşı: görsel ${i + 1}`} className="inline-flex size-10 items-center justify-center rounded-[var(--radius-sm)] border border-line hover:bg-surface-2 disabled:opacity-30">
                <ArrowDown aria-hidden="true" className="size-4" />
              </button>
            </div>
          </li>
        ))}
      </ol>
      {items.length === 0 ? <p className="text-sm text-steel">Bu ürüne bağlı görsel yok.</p> : null}
      {disabled ? null : (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-64 flex-1 flex-col gap-1 text-xs font-semibold text-steel">
            Kütüphaneden görsel bağla
            <select name="attach" defaultValue="" className="min-h-12 rounded-[var(--radius-md)] border border-line-strong bg-surface px-3 text-sm font-normal text-ink">
              <option value="">— seçme —</option>
              {library.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <SubmitButton pendingText="Kaydediliyor…">Görselleri kaydet</SubmitButton>
          <FormMessage />
        </div>
      )}
    </ActionForm>
  );
}
