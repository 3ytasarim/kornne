"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

const KEY = "kornne-theme";

/** Inline, render-blocking script: applies the stored/OS theme before first paint (no flash). */
export const themeInitScript = `try{var t=localStorage.getItem("${KEY}");if(!t){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t;document.documentElement.classList.add("js")}catch(e){document.documentElement.classList.add("js")}`;

// The <html data-theme> attribute is the single source of truth (external store).
function subscribe(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
}
const getSnapshot = () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");
const getServerSnapshot = () => null;

export function ThemeToggle({ labels }: { labels: { dark: string; light: string } }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      aria-label={theme === "dark" ? labels.light : labels.dark}
      onClick={() => {
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem(KEY, next);
        } catch {
          /* storage blocked */
        }
      }}
      className="inline-flex size-12 items-center justify-center rounded-[var(--radius-md)] text-ink hover:bg-surface-2"
    >
      {theme === "dark" ? <Sun aria-hidden="true" className="size-5" /> : <Moon aria-hidden="true" className="size-5" />}
    </button>
  );
}
