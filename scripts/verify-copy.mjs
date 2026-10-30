// Repository-isolation check: SHA-256 + size of every file under two roots (rebuildable dirs skipped),
// then a line-by-line comparison. Usage: node scripts/verify-copy.mjs <sourceRoot> <targetRoot> [reportFile]
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const [srcRoot, dstRoot, report] = process.argv.slice(2);
if (!srcRoot || !dstRoot) throw new Error("usage: verify-copy.mjs <source> <target> [report]");
const SKIP = new Set(["node_modules", ".next", "test-results", ".git"]);

function tree(root) {
  const map = new Map();
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (dir === root && SKIP.has(e.name)) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else map.set(relative(root, p).split(sep).join("/"), { sha: createHash("sha256").update(readFileSync(p)).digest("hex"), size: statSync(p).size });
    }
  };
  walk(root);
  return map;
}

const a = tree(srcRoot);
const b = tree(dstRoot);
const missing = [...a.keys()].filter((k) => !b.has(k));
const differ = [...a.keys()].filter((k) => b.has(k) && b.get(k).sha !== a.get(k).sha);
const extra = [...b.keys()].filter((k) => !a.has(k));
const count = (m, prefix) => [...m.keys()].filter((k) => k.startsWith(prefix)).length;
const summary = {
  source: srcRoot,
  target: dstRoot,
  sourceFiles: a.size,
  targetFiles: b.size,
  missingInTarget: missing,
  contentDiffers: differ,
  extraInTarget: extra,
  originals: { source: count(a, "data/source-media/originals/"), target: count(b, "data/source-media/originals/") },
  publicUpload: { source: count(a, "public/upload/"), target: count(b, "public/upload/") },
  envPresent: { source: a.has(".env"), target: b.has(".env") },
  identical: missing.length === 0 && differ.length === 0,
};
if (report) writeFileSync(report, JSON.stringify(summary, null, 1));
console.log(JSON.stringify({ ...summary, missingInTarget: missing.length, contentDiffers: differ.length, extraInTarget: extra }, null, 1));
process.exit(summary.identical ? 0 : 1);
