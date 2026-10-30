import { AdminShell } from "@/components/admin/AdminShell";
import { ADMIN_NAV } from "@/components/admin/adminNav";
import { requireAdmin } from "@/lib/auth/guard";
import { can, ROLE_LABELS } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  const nav = ADMIN_NAV.map((g) => ({ group: g.group, items: g.items.filter((i) => can(user.role, i.module)) })).filter((g) => g.items.length);
  return (
    <AdminShell user={{ name: user.name, email: user.email, roleLabel: ROLE_LABELS[user.role] }} nav={nav}>
      {children}
    </AdminShell>
  );
}
