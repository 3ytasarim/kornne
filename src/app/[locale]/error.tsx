"use client";

import { useEffect } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/States";
import { BOUNDARY_STRINGS } from "@/lib/i18n/boundary-strings";
import { isEnabledLocale } from "@/lib/i18n/config";

/** Route error boundary. Messages only — error details stay in server logs (digest). */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error.digest ?? "client error");
  }, [error]);
  const lang = typeof document !== "undefined" ? document.documentElement.lang : "tr";
  const d = BOUNDARY_STRINGS[isEnabledLocale(lang) ? lang : "tr"];
  return (
    <div className="container-site py-20">
      <ErrorState
        title={d.error.title}
        text={d.error.lead}
        action={
          <Button onClick={reset} icon={<RotateCcw aria-hidden="true" className="size-4" />}>
            {d.error.retry}
          </Button>
        }
      />
    </div>
  );
}
