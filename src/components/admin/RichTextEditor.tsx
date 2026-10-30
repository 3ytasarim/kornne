"use client";

import { useId, useRef, useState } from "react";
import { Bold, Code2, Heading2, Heading3, Italic, Link2, List, ListOrdered, RemoveFormatting } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Minimal rich-text editor for admin content (no third-party editor bundle). Produces simple HTML that the SERVER
 * sanitizes with the same allow-list as legacy content (p, h2, h3, lists, strong/em, links, tables) — what this
 * component sends is never trusted. Paste is reduced to plain text; an HTML view is available for tables.
 */
const TOOLS = [
  { cmd: "bold", label: "Kalın", Icon: Bold },
  { cmd: "italic", label: "İtalik", Icon: Italic },
  { cmd: "formatBlock:h2", label: "Ara başlık (H2)", Icon: Heading2 },
  { cmd: "formatBlock:h3", label: "Alt başlık (H3)", Icon: Heading3 },
  { cmd: "insertUnorderedList", label: "Madde listesi", Icon: List },
  { cmd: "insertOrderedList", label: "Numaralı liste", Icon: ListOrdered },
  { cmd: "createLink", label: "Bağlantı ekle", Icon: Link2 },
  { cmd: "removeFormat", label: "Biçimi temizle", Icon: RemoveFormatting },
] as const;

export function RichTextEditor({ name, label, defaultValue = "", hint, error, minHeight = "16rem" }: { name: string; label: string; defaultValue?: string; hint?: string; error?: string; minHeight?: string }) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState(defaultValue);
  const [source, setSource] = useState(false);

  const sync = () => setHtml(ref.current?.innerHTML ?? "");
  const run = (cmd: string) => {
    ref.current?.focus();
    if (cmd === "createLink") {
      const url = window.prompt("Bağlantı adresi (https://, mailto: veya tel:)");
      if (!url || !/^(https:|mailto:|tel:)/.test(url)) return;
      document.execCommand("createLink", false, url);
    } else if (cmd.startsWith("formatBlock:")) document.execCommand("formatBlock", false, cmd.split(":")[1]);
    else document.execCommand(cmd);
    sync();
  };

  return (
    <div className="space-y-1.5">
      <p id={`${id}-label`} className="text-sm font-semibold text-ink">
        {label}
      </p>
      <div className={cn("overflow-hidden rounded-[var(--radius-md)] border bg-surface", error ? "border-signal" : "border-line-strong")}>
        <div role="toolbar" aria-label={`${label} biçimlendirme`} className="flex flex-wrap items-center gap-0.5 border-b border-line bg-surface-2 px-1.5 py-1">
          {TOOLS.map(({ cmd, label: l, Icon }) => (
            <button key={cmd} type="button" disabled={source} onMouseDown={(e) => e.preventDefault()} onClick={() => run(cmd)} aria-label={l} title={l} className="inline-flex size-10 items-center justify-center rounded-[var(--radius-sm)] text-ink hover:bg-surface-3 disabled:opacity-40">
              <Icon aria-hidden="true" className="size-4" />
            </button>
          ))}
          <span className="mx-1 h-6 w-px bg-line" aria-hidden="true" />
          <button
            type="button"
            aria-pressed={source}
            onClick={() => {
              if (source && ref.current) ref.current.innerHTML = html;
              setSource((s) => !s);
            }}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-[var(--radius-sm)] px-2.5 text-xs font-semibold text-ink hover:bg-surface-3 aria-pressed:bg-brand-100"
          >
            <Code2 aria-hidden="true" className="size-4" /> HTML
          </button>
        </div>
        {source ? (
          <textarea aria-labelledby={`${id}-label`} value={html} onChange={(e) => setHtml(e.target.value)} spellCheck={false} className="block w-full resize-y bg-surface p-3 font-mono text-xs text-ink focus:outline-none" style={{ minHeight }} />
        ) : (
          <div
            ref={(el) => {
              ref.current = el;
              if (el && el.dataset.init !== "1") {
                el.innerHTML = html;
                el.dataset.init = "1";
              }
            }}
            role="textbox"
            aria-multiline="true"
            aria-labelledby={`${id}-label`}
            aria-describedby={hint || error ? `${id}-desc` : undefined}
            aria-invalid={error ? true : undefined}
            contentEditable
            suppressContentEditableWarning
            onInput={sync}
            onBlur={sync}
            onPaste={(e) => {
              e.preventDefault();
              document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
              sync();
            }}
            className="rich max-w-none overflow-y-auto p-4 text-[0.9375rem] text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            style={{ minHeight }}
          />
        )}
      </div>
      <input type="hidden" name={name} value={html} />
      {error ? (
        <p id={`${id}-desc`} role="alert" className="text-xs font-medium text-signal">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-desc`} className="text-xs text-steel">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
