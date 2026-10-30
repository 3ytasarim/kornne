import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { AdminError } from "@/lib/admin/action-state";
import { writeAuditLogVia } from "@/lib/audit-log";
import { formatIban, isValidTrIban, normalizeIban } from "./iban";

/**
 * Company bank accounts for EFT/Havale (Sprint 12). Public pages list ONLY active accounts with a valid TR IBAN;
 * an account without a real IBAN stays inactive (no placeholder number is ever published).
 */
export type PublicBankAccount = { id: string; bankName: string; accountHolder: string; iban: string; ibanFormatted: string; branch: string | null; currency: string };

/** The six banks the client uses (from the legacy payment page); IBANs are entered in Admin › Banka hesapları. */
export const DEFAULT_BANKS = ["Vakıf Bankası", "Ziraat Bankası", "Türkiye İş Bankası", "ING Bank", "Akbank", "Garanti BBVA"] as const;
export const DEFAULT_HOLDER = "Mezbaha Teknolojileri A.Ş.";

export async function listPublicBankAccounts(db: Pick<PrismaClient, "bankAccount">): Promise<PublicBankAccount[]> {
  const rows = await db.bankAccount.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { bankName: "asc" }] });
  return rows.filter((r) => isValidTrIban(r.iban)).map((r) => ({ id: r.id, bankName: r.bankName, accountHolder: r.accountHolder, iban: r.iban, ibanFormatted: formatIban(r.iban), branch: r.branch, currency: r.currency }));
}

/** Idempotent: creates the six default banks (inactive, no IBAN) if the table is empty. */
export async function ensureDefaultBanks(db: Pick<PrismaClient, "bankAccount">) {
  if (await db.bankAccount.count()) return 0;
  await db.bankAccount.createMany({ data: DEFAULT_BANKS.map((bankName, i) => ({ bankName, accountHolder: DEFAULT_HOLDER, sortOrder: i * 10 })) });
  return DEFAULT_BANKS.length;
}

const accountSchema = z.object({
  id: z.string().min(1).optional(),
  bankName: z.string().trim().min(2, "Banka adı gerekli").max(80),
  accountHolder: z.string().trim().min(2, "Hesap sahibi gerekli").max(160),
  iban: z.string().trim().max(40).transform(normalizeIban),
  branch: z.string().trim().max(120).optional().transform((v) => v || null),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  active: z.boolean().default(false),
});

export async function saveBankAccount(db: PrismaClient, actor: { id: string }, raw: z.input<typeof accountSchema>) {
  const parsed = accountSchema.safeParse(raw);
  if (!parsed.success) throw new AdminError("Formdaki hataları düzeltin.", Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
  const v = parsed.data;
  if (v.iban && !isValidTrIban(v.iban)) throw new AdminError("IBAN geçersiz.", { iban: "TR ile başlayan 26 karakterlik geçerli bir IBAN girin (kontrol hanesi tutmuyor)" });
  if (v.active && !v.iban) throw new AdminError("IBAN girilmeden hesap yayına alınamaz.", { iban: "IBAN gerekli" });
  const data = { bankName: v.bankName, accountHolder: v.accountHolder, iban: v.iban, branch: v.branch, sortOrder: v.sortOrder, active: v.active, updatedById: actor.id };
  const before = v.id ? await db.bankAccount.findUnique({ where: { id: v.id } }) : null;
  const row = v.id ? await db.bankAccount.update({ where: { id: v.id }, data }) : await db.bankAccount.create({ data });
  await writeAuditLogVia(db, { actorId: actor.id, action: v.id ? "bank_account.updated" : "bank_account.created", entityType: "BankAccount", entityId: row.id, after: { bankName: row.bankName, active: row.active, ibanSet: !!row.iban, ibanChanged: before ? before.iban !== row.iban : true } });
  return row;
}
