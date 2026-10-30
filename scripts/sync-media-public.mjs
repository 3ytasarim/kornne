// Copies the mirrored ORIGINAL media (data/source-media/originals) to public/upload/<same filename>, so the new site
// serves product images under the SAME legacy path (/upload/<name>) → no image redirects, stable Google Images URLs.
// Also writes src/data/source-snapshot/media-meta.json (dimensions, bytes, sha256) for width/height attributes.
// Dev/preview convenience only; Sprint 2 decides the production storage (local disk vs Hetzner Object Storage).
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const CSV = join(ROOT, "docs/audit/media-inventory.csv");
const OUT = join(ROOT, "public/upload");
mkdirSync(OUT, { recursive: true });

const text = readFileSync(CSV, "utf8");
const rows = [];
{
  let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (ch !== "\r") cur += ch;
  }
}
const [hdr, ...data] = rows;
const recs = data.map((r) => Object.fromEntries(hdr.map((h, i) => [h, r[i] ?? ""])));
const meta = {};
let copied = 0;
for (const r of recs) {
  if (r.mirror_status !== "ok" || !r.local_file) continue;
  const src = join(ROOT, r.local_file);
  if (!existsSync(src)) continue;
  const name = decodeURIComponent(new URL(r.url).pathname.replace(/^\/upload\//, ""));
  if (name.includes("/")) continue;
  copyFileSync(src, join(OUT, name.replace(/[<>:"\\|?*]/g, "_")));
  meta[name] = { width: +r.width || null, height: +r.height || null, bytes: +r.bytes, sha256: r.sha256, format: r.format };
  copied++;
}
// brand: byte-identical logo copy
mkdirSync(join(ROOT, "public/brand"), { recursive: true });
copyFileSync(join(ROOT, "data/source-media/originals/Kornne_Logo.png"), join(ROOT, "public/brand/kornne-logo.png"));
writeFileSync(join(ROOT, "src/data/source-snapshot/media-meta.json"), JSON.stringify(meta, null, 0) + "\n");
console.log(`copied=${copied}`);
