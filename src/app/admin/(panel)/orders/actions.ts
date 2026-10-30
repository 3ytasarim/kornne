"use server";

import { requirePermission } from "@/lib/auth/guard";
import type { ActionState } from "@/lib/admin/action-state";
import { runAction } from "@/lib/admin/run-action";
import { advanceOrder, confirmBankTransfer } from "@/lib/commerce/b2b-orders";
import { requireDb } from "@/lib/db";

/** Admin confirms an incoming EFT/Havale after checking the bank statement (money decision → admin roles only). */
export async function confirmPaymentAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("order.confirm_payment");
    await confirmBankTransfer(requireDb(), user, String(f.get("orderId") ?? ""), String(f.get("note") ?? ""));
    return "Ödeme onaylandı; sipariş 'Ödendi' durumuna geçti.";
  });
}

const NEXT = ["PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"] as const;

export async function advanceOrderAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("order.manage");
    const to = String(f.get("to") ?? "");
    if (!NEXT.includes(to as (typeof NEXT)[number])) return { error: "Geçersiz durum." };
    await advanceOrder(requireDb(), user, String(f.get("orderId") ?? ""), to as (typeof NEXT)[number], String(f.get("reason") ?? ""));
    return "Sipariş durumu güncellendi.";
  });
}
