/** Tiny className joiner (no tailwind-merge dependency; variants are designed not to conflict). */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
