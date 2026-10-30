// Small concurrency smoke (Sprint 11) — NOT a capacity test of the real VPS. GET-only, against a LOCAL build.
//   node scripts/qa/load-smoke.mjs --base=http://localhost:3470 --concurrency=20 --requests=400
// Reports p50 / p95 / max latency and errors per path (ISR/static pages, product page, search (dynamic), health (DB)).
const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const BASE = arg("base", "http://localhost:3470");
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(BASE)) throw new Error("local targets only");
const C = Number(arg("concurrency", 20));
const N = Number(arg("requests", 400));
const PATHS = ["/", "/kategori/tum-urunler", "/urun/dairesel-kesim-hucresi", "/arama?q=kesim", "/api/health", "/ar"];
const lat = Object.fromEntries(PATHS.map((p) => [p, []]));
const errors = Object.fromEntries(PATHS.map((p) => [p, 0]));
let next = 0;
const t0 = Date.now();
await Promise.all(
  Array.from({ length: C }, async () => {
    for (let i = next++; i < N; i = next++) {
      const p = PATHS[i % PATHS.length];
      const s = performance.now();
      try {
        const r = await fetch(BASE + p, { signal: AbortSignal.timeout(15_000) });
        await r.arrayBuffer();
        if (r.status !== 200) errors[p]++;
      } catch {
        errors[p]++;
      }
      lat[p].push(performance.now() - s);
    }
  }),
);
const pct = (a, q) => Math.round([...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * q))]);
const rows = PATHS.map((p) => ({ path: p, n: lat[p].length, p50: pct(lat[p], 0.5), p95: pct(lat[p], 0.95), max: Math.round(Math.max(...lat[p])), errors: errors[p] }));
const secs = (Date.now() - t0) / 1000;
console.table(rows);
console.log(JSON.stringify({ base: BASE, concurrency: C, requests: N, seconds: secs, rps: Math.round(N / secs), errors: Object.values(errors).reduce((a, b) => a + b, 0) }));
