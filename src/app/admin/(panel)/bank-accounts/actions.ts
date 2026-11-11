"use server";

import { requirePermission } from "@/lib/auth/guard";
import type { ActionState } from "@/lib/admin/action-state";
import { revalidateStorefront } from "@/lib/admin/revalidate";
import { runAction } from "@/lib/admin/run-action";
import { saveBankAccount } from "@/lib/commerce/bank-accounts";
import { requireDb } from "@/lib/db";

export async function saveBankAccountAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("bank.manage");
    const row = await saveBankAccount(requireDb(), user, {
      id: String(f.get("id") ?? "") || undefined,
      bankName: String(f.get("bankName") ?? ""),
      accountHolder: String(f.get("accountHolder") ?? ""),
      iban: String(f.get("iban") ?? ""),
      branch: String(f.get("branch") ?? ""),
      currency: (String(f.get("currency") ?? "TRY") || "TRY") as "TRY" | "USD" | "EUR",
      sortOrder: Number(f.get("sortOrder") ?? 0),
      active: f.get("active") === "on",
    });
    revalidateStorefront("layout", { layout: true });
    return row.active ? "Kaydedildi — hesap sitede yayında." : "Kaydedildi — hesap sitede gösterilmiyor (pasif).";
  });
}
