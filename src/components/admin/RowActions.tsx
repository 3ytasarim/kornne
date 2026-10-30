import Link from "next/link";
import { Eye, EyeOff, Pencil, Trash2 } from "lucide-react";
import type { ActionState } from "@/lib/admin/action-state";
import { buttonClass } from "@/components/ui/Button";
import { ActionForm, ConfirmSubmit, FormMessage, SubmitButton } from "./forms";

type Action = (prev: ActionState, form: FormData) => Promise<ActionState>;

/**
 * Explicit row buttons for admin lists: "Düzenle" (link), "Pasif yap / Aktif yap" (one click) and "Sil" (two-step
 * confirm). Each button is shown only when the user has the right and an action exists for the entity.
 */
export function RowActions({ id, editHref, editLabel = "Düzenle", toggle, remove }: { id: string; editHref?: string; editLabel?: string; toggle?: { action: Action; active: boolean; labels?: [string, string] }; remove?: { action: Action; label?: string; confirm?: string } }) {
  return (
    <div className="relative flex flex-wrap items-center justify-end gap-1.5">
      {editHref ? (
        <Link href={editHref} className={buttonClass("secondary", "sm")}>
          <Pencil aria-hidden="true" className="size-3.5" />
          {editLabel}
        </Link>
      ) : null}
      {toggle ? (
        <ActionForm action={toggle.action} className="contents">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="active" value={toggle.active ? "false" : "true"} />
          <SubmitButton variant="outline" size="sm" pendingText="…" icon={toggle.active ? <EyeOff aria-hidden="true" className="size-3.5" /> : <Eye aria-hidden="true" className="size-3.5" />}>
            {toggle.active ? (toggle.labels?.[0] ?? "Pasif yap") : (toggle.labels?.[1] ?? "Aktif yap")}
          </SubmitButton>
          <FormMessage className="w-full basis-full text-xs" />
        </ActionForm>
      ) : null}
      {remove ? (
        <ActionForm action={remove.action} className="contents">
          <input type="hidden" name="id" value={id} />
          <ConfirmSubmit variant="outline" size="sm" confirmText={remove.confirm ?? "Silinsin mi? Tekrar tıklayın"}>
            <Trash2 aria-hidden="true" className="size-3.5" />
            {remove.label ?? "Sil"}
          </ConfirmSubmit>
          <FormMessage className="w-full basis-full text-xs" />
        </ActionForm>
      ) : null}
    </div>
  );
}
