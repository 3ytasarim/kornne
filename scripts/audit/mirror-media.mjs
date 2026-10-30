// Read-only, rate-limited mirror of the source site's media (originals are stored byte-for-byte, never modified).
// Reads docs/audit/media-inventory.csv, writes data/source-media/originals/<original filename> and
// docs/audit/media-inventory.csv enriched with bytes / sha256 / width / height / format / status.
// Usage: node scripts/audit/mirror-media.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import sharp from "sharp";

const ROOT = resolve(import.meta.dirname, "../..");
const CSV = join(ROOT, "docs/audit/media-inventory.csv");
const DIR = join(ROOT, "data/source-media/originals");
const UA = "KORNNE-Audit/1.0 (read-only media inventory for site owner)";
const DELAY = 600;
mkdirSync(DIR, { recursive: true });

function parseCsv(text) {
  const rows = [];
  let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (ch !== "\r") cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const [hdr, ...data] = rows;
  return { hdr, data: data.map((r) => Object.fromEntries(hdr.map((h, i) => [h, r[i] ?? ""]))) };
}
const cell = (v) => (/[",\n]/.test(String(v ?? "")) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ""));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// keep the original filename but make it safe on Windows; collisions get the sha prefix appended later
const safeName = (name) => name.replace(/[<>:"/\\|?*]/g, "_");

const { data } = parseCsv(readFileSync(CSV, "utf8"));
let done = 0;
for (const row of data) {
  const file = join(DIR, safeName(row.filename));
  try {
    let buf;
    if (existsSync(file)) buf = readFileSync(file);
    else {
      const res = await fetch(row.url, { headers: { "User-Agent": UA } });
      row.http_status = res.status;
      if (!res.ok) { row.mirror_status = `http_${res.status}`; await sleep(DELAY); continue; }
      buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(file, buf);
      await sleep(DELAY);
    }
    row.http_status ||= 200;
    row.bytes = buf.length;
    row.sha256 = createHash("sha256").update(buf).digest("hex");
    try {
      const meta = await sharp(buf).metadata();
      row.width = meta.width;
      row.height = meta.height;
      row.format = meta.format;
      row.merchant_500px_ok = meta.width >= 500 && meta.height >= 500 ? "yes" : "NO";
    } catch {
      row.format = "unreadable";
    }
    row.local_file = `data/source-media/originals/${safeName(row.filename)}`;
    row.mirror_status = "ok";
  } catch (e) {
    row.mirror_status = `error:${String(e.message ?? e).slice(0, 60)}`;
  }
  if (++done % 25 === 0) console.log(`${done}/${data.length}`);
}
// duplicate detection across languages (same bytes uploaded under different names)
const bySha = new Map();
for (const r of data) if (r.sha256) bySha.set(r.sha256, [...(bySha.get(r.sha256) ?? []), r.filename]);
for (const r of data) r.duplicate_of = r.sha256 && bySha.get(r.sha256).length > 1 ? bySha.get(r.sha256).filter((f) => f !== r.filename).slice(0, 3).join("|") : "";

const cols = ["url", "filename", "kind", "usage_count", "usages", "alts", "http_status", "mirror_status", "bytes", "sha256", "width", "height", "format", "merchant_500px_ok", "duplicate_of", "local_file"];
writeFileSync(CSV, [cols.join(","), ...data.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n") + "\n");
const ok = data.filter((r) => r.mirror_status === "ok");
console.log(`DONE ok=${ok.length}/${data.length} bytes=${ok.reduce((a, r) => a + +r.bytes, 0)} small=${ok.filter((r) => r.merchant_500px_ok === "NO").length}`);
