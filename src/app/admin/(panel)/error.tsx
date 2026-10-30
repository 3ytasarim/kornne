"use client";

import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/States";

export default function AdminError({ reset }: { error: Error; reset: () => void }) {
  return <ErrorState title="Bir hata oluştu" text="İşlem tamamlanamadı. Ayrıntılar sunucu kayıtlarında." action={<Button onClick={reset}>Tekrar dene</Button>} />;
}
