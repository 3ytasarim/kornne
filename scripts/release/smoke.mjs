// Post-deploy / post-rollback SMOKE TEST (Sprint 11). Read-only GET/HEAD requests; exit 1 on any failure.
//   node scripts/release/smoke.mjs --base=https://staging.kornne.com --mode=staging --auth=user:pass
//   node scripts/release/smoke.mjs --base=https://kornne.com --mode=production
//   node scripts/release/smoke.mjs --base=http://127.0.0.1:3018 --mode=production-candidate   (release.sh, loopback)
// Modes: staging = must be PRIVATE + noindex · production = TR catalogue indexable, robots/sitemap open ·
//        production-candidate = production build on loopback (no TLS checks) · local = this repo's noindex test server
import { readFileSync } from "node:fs";
import tls from "node:tls";

const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const BASE = (arg("base") ?? "").replace(/\/+$/, "");
const MODE = arg("mode", "staging");
const AUTH = arg("auth") ?? process.env.SMOKE_AUTH ?? "";
if (!/^https?:\/\//.test(BASE)) throw new Error("--base=https://… required");
const prodLike = MODE === "production" || MODE === "production-candidate";
const headers = AUTH ? { authorization: `Basic ${Buffer.from(AUTH).toString("base64")}` } : {};
const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok: !!ok, detail });
const get = async (path, opts = {}) => {
  const res = await fetch(BASE + path, { redirect: "manual", headers, signal: AbortSignal.timeout(20_000), ...opts });
  const text = opts.method === "HEAD" ? "" : await res.text();
  return { status: res.status, h: Object.fromEntries(res.headers), text, location: res.headers.get("location") };
};
const pathOf = (loc) => (loc ? decodeURIComponent(new URL(loc, BASE).pathname) : "");

// 1. health + core pages
const health = await get("/api/health");
check("health 200 + db ok", health.status === 200 && /"db":"ok"/.test(health.text), `${health.status} ${health.text.slice(0, 60)}`);
for (const [path, lang] of [["/", "tr"], ["/kategori/tum-urunler", "tr"], ["/urun/dairesel-kesim-hucresi", "tr"], ["/en", "en"], ["/ar", "ar"], ["/sayfa/kurumsal", "tr"]]) {
  const r = await get(path);
  check(`${path} 200 + lang=${lang}`, r.status === 200 && r.text.includes(`<html lang="${lang}"`), String(r.status));
  const robots = r.text.match(/<meta name="robots" content="([^"]+)"/)?.[1] ?? "";
  if (MODE === "staging" || MODE === "local") check(`${path} noindex`, /noindex/.test(robots) && /noindex/.test(r.h["x-robots-tag"] ?? ""), robots);
  if (prodLike && lang === "tr" && path !== "/") {
    const canonical = r.text.match(/<link rel="canonical" href="([^"]+)"/)?.[1] ?? "";
    check(`${path} canonical on ${new URL(BASE).host}`, canonical.startsWith(BASE) || MODE === "production-candidate", canonical);
  }
}
const nf = await get("/bu-sayfa-yok-smoke");
check("real 404", nf.status === 404);

// 2. legacy redirects: all 125, ONE hop to a 200 page; held product #208 stays 307
const map = JSON.parse(readFileSync(new URL("../../src/data/redirects.json", import.meta.url), "utf8"));
let redirectOk = 0;
const redirectFail = [];
for (const [from, to] of Object.entries(map)) {
  const r = await get(encodeURI(from));
  const okHop = r.status === 301 && pathOf(r.location) === to.split("?")[0];
  const target = okHop ? await get(encodeURI(pathOf(r.location))) : { status: 0 };
  if (okHop && target.status === 200) redirectOk++;
  else redirectFail.push(`${from} → ${r.status} ${pathOf(r.location)} (${target.status})`);
}
check(`legacy redirects ${redirectOk}/${Object.keys(map).length} (301, one hop, 200)`, redirectOk === Object.keys(map).length, redirectFail.slice(0, 3).join(" · "));
const held = await get("/urun/ikizray-kurban-kancasi");
check("#208 temporary 307", held.status === 307, `${held.status} → ${pathOf(held.location)}`);

// 3. robots / sitemap per environment
const robots = await get("/robots.txt");
const sitemap = await get("/sitemap.xml");
if (prodLike) {
  check("robots allows + sitemap line", /Allow: \//.test(robots.text) && /Sitemap: /.test(robots.text) && !/^Disallow: \/$/m.test(robots.text), robots.text.slice(0, 80));
  check("sitemap has URLs", (sitemap.text.match(/<loc>/g) ?? []).length > 40, `${(sitemap.text.match(/<loc>/g) ?? []).length} loc`);
  check("sitemap has no admin/search", !/\/(admin|arama)/.test(sitemap.text));
} else {
  check("robots Disallow: /", /^Disallow: \/\s*$/m.test(robots.text));
  check("sitemap empty", !sitemap.text.includes("<url>"));
}

// 4. security headers, admin, closed commerce, private merchant feed
const home = await get("/");
check("CSP enforced", /default-src 'self'/.test(home.h["content-security-policy"] ?? ""));
check("X-Frame-Options DENY + nosniff", home.h["x-frame-options"] === "DENY" && home.h["x-content-type-options"] === "nosniff");
if (BASE.startsWith("https://")) check("HSTS", /max-age=\d{7,}/.test(home.h["strict-transport-security"] ?? ""));
const admin = await get("/admin");
check("/admin → login", [302, 303, 307].includes(admin.status) && /\/admin\/login/.test(admin.location ?? ""), `${admin.status} ${admin.location}`);
const login = await get("/admin/login");
check("admin login noindex", /noindex/.test(login.h["x-robots-tag"] ?? ""));
const feed = await get("/admin/merchant/feed/export?format=xml");
check("Merchant feed not public", feed.status !== 200, String(feed.status));
const checkout = await get("/odeme");
check("checkout page locked (noindex, no payment form)", checkout.status === 200 && /noindex/.test(checkout.text) && !/name="(cardNumber|cvc|iban)"/i.test(checkout.text));
const img = await get("/upload/Kornne-Dairesel-Hucre-63.jpg", { method: "HEAD" });
check("legacy image URL 200 image/jpeg", img.status === 200 && /image\/jpeg/.test(img.h["content-type"] ?? ""), `${img.status} ${img.h["content-type"]}`);
const broken = await get("/upload/belge1.jpg", { method: "HEAD" });
check("source-broken image stays 404", broken.status === 404);

// 5. TLS certificate lifetime (https only)
if (BASE.startsWith("https://")) {
  const host = new URL(BASE).hostname;
  const days = await new Promise((res) => {
    const s = tls.connect({ host, port: 443, servername: host, timeout: 10_000 }, () => {
      const c = s.getPeerCertificate();
      s.end();
      res(Math.floor((Date.parse(c.valid_to) - Date.now()) / 86_400_000));
    });
    s.on("error", () => res(-1));
  });
  check("TLS certificate valid ≥ 14 days", days >= 14, `${days} days`);
}

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? "ok  " : "FAIL"}  ${r.name}${r.detail && !r.ok ? `  — ${r.detail}` : ""}`);
console.log(`\nsmoke ${MODE} @ ${BASE}: ${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
