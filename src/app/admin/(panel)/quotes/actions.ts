"use server";

import { requirePermission } from "@/lib/auth/guard";
import type { ActionState } from "@/lib/admin/action-state";
import { addQuoteNote, assignQuote, changeQuoteStatus, setQuoteFollowUp } from "@/lib/admin/quotes";
import { formObject, runAction } from "@/lib/admin/run-action";
import { requireDb } from "@/lib/db";
import { STATUS_LABEL } from "@/lib/quote/status-labels";

export async function changeStatusAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("quote.manage");
    await changeQuoteStatus(requireDb(), user, formObject(f));
    return `Durum güncellendi: ${STATUS_LABEL[String(f.get("to"))] ?? f.get("to")}.`;
  });
}

export async function assignAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("quote.manage");
    await assignQuote(requireDb(), user, formObject(f));
    return f.get("assigneeId") ? "Sorumlu atandı." : "Atama kaldırıldı.";
  });
}

export async function followUpAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("quote.manage");
    await setQuoteFollowUp(requireDb(), user, formObject(f));
    return f.get("followUpAt") ? "Takip tarihi kaydedildi." : "Takip tarihi kaldırıldı.";
  });
}

export async function addNoteAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("quote.manage");
    await addQuoteNote(requireDb(), user, formObject(f));
    return "İç not eklendi (müşteri görmez).";
  });
}
