// Mobile Lighthouse for key pages (local `next start`, simulated throttling = Lighthouse defaults).
// Each page runs LH_RUNS times (default 3); the run with the median performance score is kept (LH variance is ±5).
// Usage: node scripts/qa/lighthouse.mjs <lighthouse-cli-path> [baseUrl]   → docs/qa/lighthouse/*.json + summary.json
//        LH_PAGES=product,home LH_OUT=docs/qa/lighthouse-exp node scripts/qa/lighthouse.mjs …   (subset / other folder)
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";

const [cli, base = "http://localhost:3460"] = process.argv.slice(2);
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const RUNS = Number(process.env.LH_RUNS || 3);
const OUT = process.env.LH_OUT || "docs/qa/lighthouse";
const ALL = { home: "/", category: "/kategori/tum-urunler", product: "/urun/dairesel-kesim-hucresi", "home-ar": "/ar", search: "/arama?q=testere", "product-variant": "/urun/kucuk-bas-stoklama-kancasi", "quote-list": "/teklif-listem", "cart-locked": "/sepetim", corporate: "/sayfa/kurumsal", "admin-login": "/admin/login" };
const PAGES = process.env.LH_PAGES ? Object.fromEntries(process.env.LH_PAGES.split(",").map((k) => [k, ALL[k]])) : ALL;
mkdirSync(OUT, { recursive: true });
const summary = {};
let failedRuns = 0;
let cleanupErrors = 0;
for (const [name, path] of Object.entries(PAGES)) {
  await fetch(base + path); // warm the server cache once
  const runs = [];
  for (let i = 0; i < RUNS; i++) {
    const out = `${OUT}/${name}.run${i}.json`;
    rmSync(out, { force: true }); // never count a stale report from an earlier run
    let exitError = false;
    try {
      execFileSync(process.execPath, [cli, base + path, `--chrome-path=${CHROME}`, "--chrome-flags=--headless=new", "--only-categories=performance,accessibility,best-practices,seo", "--output=json", `--output-path=${out}`, "--quiet"], { stdio: ["ignore", "ignore", "pipe"] });
    } catch {
      exitError = true; // Windows: chrome-launcher may fail to delete its temp profile (EPERM) AFTER the report is written
    }
    try {
      const rep = JSON.parse(readFileSync(out, "utf8"));
      if (rep.runtimeError || rep.categories.performance.score === null) throw new Error("runtime error");
      if (exitError) cleanupErrors++;
      runs.push({ out, perf: rep.categories.performance.score });
    } catch {
      failedRuns++; // no valid report (Chrome did not launch / page error) — counted and reported, not hidden
    }
  }
  if (!runs.length) continue;
  const sorted = [...runs].sort((a, b) => a.perf - b.perf);
  const median = sorted[Math.floor(sorted.length / 2)];
  renameSync(median.out, `${OUT}/${name}.json`);
  const r = JSON.parse(readFileSync(`${OUT}/${name}.json`, "utf8"));
  const a = r.audits;
  summary[name] = {
    url: path,
    perfRuns: runs.map((x) => Math.round(x.perf * 100)),
    scores: Object.fromEntries(Object.values(r.categories).map((c) => [c.id, Math.round(c.score * 100)])),
    LCP: a["largest-contentful-paint"].displayValue,
    FCP: a["first-contentful-paint"].displayValue,
    CLS: a["cumulative-layout-shift"].displayValue,
    TBT: a["total-blocking-time"].displayValue,
    SI: a["speed-index"].displayValue,
    documentKiB: Math.round((a["network-requests"].details.items.find((i) => i.resourceType === "Document")?.transferSize ?? 0) / 1024),
    failedSeo: r.categories.seo.auditRefs.filter((x) => x.weight > 0 && a[x.id]?.score !== null && a[x.id]?.score < 1).map((x) => x.id),
  };
  console.log(name, JSON.stringify(summary[name].perfRuns), JSON.stringify(summary[name].scores), summary[name].LCP, summary[name].TBT, `${summary[name].documentKiB}KiB`);
}
writeFileSync(`${OUT}/summary.json`, JSON.stringify({ tool: `lighthouse 13.5.0 (mobile, simulated throttling, median of ${RUNS})`, base, measuredAt: new Date().toISOString(), failedRuns, cleanupErrorsAfterValidReport: cleanupErrors, summary }, null, 1));
