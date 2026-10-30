import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Server-rendered admin data table (Bifire admin/ui.tsx Table pattern): real <table>, scope=col headers,
 * caption for screen readers, horizontal scroll container on small screens, empty row.
 */
export type Column<T> = { key: string; header: string; cell: (row: T) => ReactNode; align?: "start" | "end"; className?: string };

export function DataTable<T>({ caption, columns, rows, rowKey, empty }: { caption: string; columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string; empty: string }) {
  return (
    <div className="min-w-0 overflow-x-auto rounded-[var(--radius-lg)] border border-line bg-surface" tabIndex={0} role="region" aria-label="Kaydırılabilir tablo">
      <table className="w-full min-w-[40rem] border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-surface-2 text-xs tracking-wide text-steel uppercase">
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cn("px-4 py-3 font-semibold", c.align === "end" ? "text-end" : "text-start", c.className)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-10 text-center text-steel">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={rowKey(r)} className="border-t border-line hover:bg-surface-2/60">
                {columns.map((c) => (
                  <td key={c.key} className={cn("px-4 py-3 align-top", c.align === "end" ? "text-end tabular-nums" : "text-start", c.className)}>
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
