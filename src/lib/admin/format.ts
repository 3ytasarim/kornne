/** Admin date formatting — always Europe/Istanbul, Turkish format, regardless of the server's timezone. */
const dt = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const d = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", year: "numeric" });

export const fmtDateTime = (v: Date | string | null | undefined) => (v ? dt.format(new Date(v)) : "—");
export const fmtDate = (v: Date | string | null | undefined) => (v ? d.format(new Date(v)) : "—");
/** yyyy-mm-dd in Istanbul time (for <input type="date"> defaults) */
export const isoDay = (v: Date | string | null | undefined) => (v ? new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date(v)) : "");
/** yyyy-mm-ddThh:mm in Istanbul time (for <input type="datetime-local">) */
export const isoLocal = (v: Date | string | null | undefined) => {
  if (!v) return "";
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(v));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "00";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour") === "24" ? "00" : g("hour")}:${g("minute")}`;
};
/** "2026-10-22T14:30" typed in the admin (Istanbul wall-clock) → Date */
export const fromIsoLocal = (v: string) => (v ? new Date(`${v}:00+03:00`) : null);

/** Start of "today" in Istanbul as a Date */
export function istanbulDayStart(now = new Date()): Date {
  return new Date(`${isoDay(now)}T00:00:00+03:00`);
}

/** Safe page number from a search param. */
export const pageParam = (v: string | string[] | undefined, max = 10_000) => {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isInteger(n) && n >= 1 && n <= max ? n : 1;
};
export const strParam = (v: string | string[] | undefined, maxLen = 120) => (Array.isArray(v) ? v[0] : v)?.slice(0, maxLen).trim() ?? "";

/** Turkish-aware fold for search ("İ"/"ı", accents). */
export const fold = (s: string) => s.toLocaleLowerCase("tr").replace(/ı/g, "i").normalize("NFKD").replace(/\p{M}/gu, "");
