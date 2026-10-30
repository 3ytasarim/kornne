// Media integrity: every MediaAsset row ↔ original file ↔ served copy (public/upload) must have the same SHA-256.
// Read-only. Usage: node scripts/verify-media.mjs
import "dotenv/config";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const client = new pg.Client({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL });
await client.connect();
const rows = (await client.query(`select "storageKey", "publicPath", sha256, bytes from "MediaAsset"`)).rows;
await client.end();

const out = { dbRows: rows.length, originalsOnDisk: readdirSync("data/source-media/originals").length, servedOnDisk: readdirSync("public/upload").length, originalMismatch: [], servedMismatch: [], missingFiles: [] };
for (const r of rows) {
  const orig = join("data/source-media", r.storageKey);
  const served = join("public", r.publicPath);
  if (!existsSync(orig) || !existsSync(served)) {
    out.missingFiles.push(r.publicPath);
    continue;
  }
  if (sha(orig) !== r.sha256) out.originalMismatch.push(r.storageKey);
  if (sha(served) !== r.sha256) out.servedMismatch.push(r.publicPath);
}
out.ok = out.dbRows === 445 && !out.originalMismatch.length && !out.servedMismatch.length && !out.missingFiles.length;
console.log(JSON.stringify(out, null, 1));
process.exit(out.ok ? 0 : 1);
