import type { Locale } from "@/lib/i18n/config";
import { formatMoney } from "@/lib/money";

/** Decimal-string minor units from a Server Action → display string (bigint never crosses the boundary). */
export const money = (minor: string, locale: Locale) => formatMoney(BigInt(minor), "TRY", locale);
