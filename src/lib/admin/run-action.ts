import "server-only";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { ForbiddenError, UnauthenticatedError } from "@/lib/auth/guard";
import { AdminError, zodFields, type ActionState } from "./action-state";

/**
 * Uniform error handling for admin server actions: permission / validation / business errors become a form
 * state; anything unexpected is logged WITHOUT the payload and shown as a generic message (no data leaks).
 */
export async function runAction(fn: () => Promise<string | ActionState>): Promise<ActionState> {
  try {
    const r = await fn();
    // admin screens are dynamic: refresh them so forms get fresh data / concurrency tokens after a write
    try {
      revalidatePath("/admin", "layout");
    } catch {
      /* outside a request (tests) */
    }
    return typeof r === "string" ? { ok: r, at: Date.now() } : { at: Date.now(), ...r };
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e && String((e as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT")) throw e;
    if (e instanceof ForbiddenError || e instanceof UnauthenticatedError) return { error: e.message, at: Date.now() };
    if (e instanceof AdminError) return { error: e.message, fields: e.fields, at: Date.now() };
    if (e instanceof ZodError) return { error: "Formdaki hataları düzeltin.", fields: zodFields(e.issues), at: Date.now() };
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: "Bu değer başka bir kayıtta kullanılıyor (benzersiz olmalı).", at: Date.now() };
    console.error("[admin-action]", e instanceof Error ? `${e.name}: ${e.message.split("\n")[0]}` : "unknown error");
    return { error: "İşlem tamamlanamadı. Lütfen tekrar deneyin.", at: Date.now() };
  }
}

/** FormData → plain object (repeated keys become arrays). */
export function formObject(form: FormData): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [k, v] of form.entries()) {
    if (typeof v !== "string") continue;
    const prev = out[k];
    out[k] = prev === undefined ? v : Array.isArray(prev) ? [...prev, v] : [prev, v];
  }
  return out;
}
