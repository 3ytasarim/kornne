import "server-only";
import { redirect } from "next/navigation";
import { writeAuditLog } from "@/lib/audit-log";
import { getIpHash } from "@/lib/request-meta";
import { allowed, can, type AdminAction, type AdminModule } from "./rbac";
import { getSessionUser, type SessionUser } from "./session";

/**
 * First line of EVERY admin page. The proxy cookie check is only a redirect convenience;
 * authorization happens here against the database session.
 */
export async function requireAdmin(module: AdminModule = "dashboard"): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!can(user.role, module)) redirect("/admin?denied=1");
  return user;
}

export class ForbiddenError extends Error {
  constructor(public action: string) {
    super("Bu işlem için yetkiniz yok.");
  }
}
export class UnauthenticatedError extends Error {
  constructor() {
    super("Oturumunuz sona erdi. Lütfen yeniden giriş yapın.");
  }
}

/**
 * First line of EVERY admin server action / route handler that reads PII or writes. Deny by default; a refusal is
 * audited (who tried what) without the payload.
 */
export async function requirePermission(action: AdminAction): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new UnauthenticatedError();
  if (!allowed(user.role, action)) {
    await writeAuditLog({ actorId: user.id, action: "auth.denied", entityType: "Permission", entityId: action, ipHash: await getIpHash().catch(() => null) });
    throw new ForbiddenError(action);
  }
  return user;
}

/** Same as requirePermission, satisfied by ANY of the listed operations. */
export async function requireAnyPermission(actions: AdminAction[]): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new UnauthenticatedError();
  if (!actions.some((a) => allowed(user.role, a))) {
    await writeAuditLog({ actorId: user.id, action: "auth.denied", entityType: "Permission", entityId: actions.join("|"), ipHash: await getIpHash().catch(() => null) });
    throw new ForbiddenError(actions.join("|"));
  }
  return user;
}

/** Non-throwing check for conditional UI (a hidden control is never the security boundary). */
export async function hasPermission(action: AdminAction): Promise<boolean> {
  const user = await getSessionUser();
  return !!user && allowed(user.role, action);
}
