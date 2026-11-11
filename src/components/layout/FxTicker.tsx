"use client";

import { useEffect, useState } from "react";
import { TrendingUp } from "lucide-react";

type Fx = { usd: number; eur: number; date: string };

/**
 * USD / EUR → TRY (TCMB ForexSelling) in the header utility bar. The server renders the current value; the browser
 * re-reads /api/v1/fx every 5 minutes (TCMB itself publishes once per business day, ~15:30).
 */
export function FxTicker({ initial, intl, labels }: { initial: Fx | null; intl: string; labels: { title: string; source: string } }) {
  const [fx, setFx] = useState<Fx | null>(initial);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = (await (await fetch("/api/v1/fx", { cache: "no-store" })).json()) as { ok: boolean } & Partial<Fx>;
        if (alive && r.ok && r.usd && r.eur && r.date) setFx({ usd: r.usd, eur: r.eur, date: r.date });
      } catch {
        /* keep the last value */
      }
    };
    const id = window.setInterval(load, 5 * 60_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);
  if (!fx) return null;
  const f = (r4: number) => (r4 / 10_000).toLocaleString(intl, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  return (
    <p className="inline-flex items-center gap-2 whitespace-nowrap tabular-nums" aria-label={labels.title} title={`${labels.source} · ${fx.date}`}>
      <TrendingUp aria-hidden="true" className="size-3.5 text-emerald-400" />
      <span>
        <span className="text-white/60">USD</span> <span className="font-semibold text-white">₺{f(fx.usd)}</span>
      </span>
      <span aria-hidden="true" className="text-white/30">
        ·
      </span>
      <span>
        <span className="text-white/60">EUR</span> <span className="font-semibold text-white">₺{f(fx.eur)}</span>
      </span>
      <span className="hidden text-white/50 sm:inline">
        ({labels.source} {fx.date})
      </span>
    </p>
  );
}
