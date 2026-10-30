import { z } from "zod";
import { LOCALES } from "@/lib/i18n/config";

/**
 * Quote request input contract (shared by the server action and tests). Messages are error CODES — the UI maps
 * them to the visitor's language; nothing here echoes user input back.
 */
// control characters (except tab/newline) are stripped; text is stored as plain text and rendered escaped
const clean = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
const text = (max: number) => z.string().max(max * 2).transform(clean).pipe(z.string().max(max));
const optionalText = (max: number) =>
  z
    .string()
    .max(max * 2)
    .optional()
    .transform((v) => (v ? clean(v) : ""))
    .pipe(z.string().max(max))
    .transform((v) => v || null);

export const QUOTE_LIMITS = { maxLines: 50, maxQty: 999, minFillMs: 2_000, maxFormAgeMs: 24 * 60 * 60 * 1000 } as const;

export const quoteItemSchema = z.object({
  productRef: z.string().regex(/^\d{1,8}$/),
  variantId: z
    .string()
    .regex(/^[a-z0-9]{10,40}$/)
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  quantity: z.number().int().min(1).max(QUOTE_LIMITS.maxQty),
});

export const quoteInputSchema = z
  .object({
    locale: z.enum(LOCALES),
    name: text(120).pipe(z.string().min(2, "required")),
    company: optionalText(160),
    email: optionalText(160).pipe(z.email("invalidEmail").nullable()),
    phone: optionalText(25).refine((v) => v === null || (/^[+0-9 ()-]{7,25}$/.test(v) && v.replace(/\D/g, "").length >= 7), "invalidPhone"),
    message: optionalText(2000),
    items: z.array(quoteItemSchema).min(1, "items").max(QUOTE_LIMITS.maxLines, "items"),
    idempotencyKey: z.uuid(),
    /** honeypot — must stay empty (bots fill every field) */
    website: z.string().max(200).optional(),
    /** ms timestamp when the form was rendered (too-fast submissions are bots) */
    startedAt: z.number().int(),
    source: z.enum(["PRODUCT_PAGE", "QUOTE_LIST"]).default("QUOTE_LIST"),
  })
  .refine((v) => v.email !== null || v.phone !== null, { message: "contactRequired", path: ["email"] });

export type QuoteInput = z.input<typeof quoteInputSchema>;
export type ParsedQuote = z.output<typeof quoteInputSchema>;
