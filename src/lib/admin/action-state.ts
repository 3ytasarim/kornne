/**
 * Result shape of every admin server action (consumed by useActionState in the forms).
 * `fields` = per-field validation messages; `ok` = success message; `error` = form-level failure.
 */
export type ActionState = { ok?: string; error?: string; fields?: Record<string, string>; at?: number; data?: Record<string, string> };

/** Business-rule violation with a user-facing (Turkish) message. Services throw it; actions turn it into state. */
export class AdminError extends Error {
  constructor(
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

/** Zod issues → { fieldPath: message } (first message per field). */
export function zodFields(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const k = i.path.map(String).join(".") || "_";
    if (!out[k]) out[k] = i.message;
  }
  return out;
}
