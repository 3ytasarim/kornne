/**
 * IBAN helpers (Sprint 12). Turkish IBAN: "TR" + 2 check digits + 5-digit bank code + 1 reserve digit + 16-digit
 * account = 26 characters, validated with the ISO 13616 mod-97 check. Placeholders such as "TR00 0000 … 00" fail.
 */
export const normalizeIban = (raw: string) => raw.replace(/\s+/g, "").toUpperCase();

export function isValidTrIban(raw: string): boolean {
  const iban = normalizeIban(raw);
  if (!/^TR\d{24}$/.test(iban)) return false;
  if (/^TR\d{2}0+$/.test(iban)) return false; // all-zero placeholders
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const digits = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rem = 0;
  for (const d of digits) rem = (rem * 10 + Number(d)) % 97;
  return rem === 1;
}

/** "TR330006100519786457841326" → "TR33 0006 1005 1978 6457 8413 26" */
export const formatIban = (raw: string) => normalizeIban(raw).replace(/(.{4})/g, "$1 ").trim();
