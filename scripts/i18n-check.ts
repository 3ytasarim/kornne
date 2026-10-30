/** Reports UI dictionary keys a locale does not translate (they would silently fall back). Exit 1 if any. */
import { missingKeys } from "../src/lib/i18n/dictionaries";

let total = 0;
for (const l of ["en", "fr", "ru", "ar"] as const) {
  const m = missingKeys(l);
  total += m.length;
  console.log(`${l}: ${m.length === 0 ? "complete" : `${m.length} missing → ${m.join(", ")}`}`);
}
process.exit(total ? 1 : 0);
