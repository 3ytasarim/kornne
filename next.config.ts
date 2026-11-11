import type { NextConfig } from "next";
import { buildCsp } from "./src/lib/security/csp";

const indexable = process.env.SITE_INDEXABLE === "true";

/**
 * Security headers (Bifire next.config.ts baseline + KORNNE additions). Sprint 11: full enforced CSP from
 * src/lib/security/csp.ts (external scripts limited to the Google tag hosts, and only when analytics is enabled).
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Content-Security-Policy", value: buildCsp() },
];

const nextConfig: NextConfig = {
  // Sprint 8: the offline production-like preview (SITE_INDEXABLE + CATALOG_DATA_VERIFIED on localhost:3471) is a
  // separate build in .next-prodlike so it never overwrites the regular (noindex) build — see scripts/test-db/e2e.mjs
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  // trailing "/" is handled in src/proxy.ts so legacy URLs ("/lang-eng/") 301 in ONE hop
  skipTrailingSlashRedirect: true,
  reactStrictMode: true,
  // canonical/hreflang/OG must be in <head> for every client, incl. AI crawlers (Bifire setting)
  htmlLimitedBots: /.*/,
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [360, 480, 640, 768, 960, 1200, 1600, 2048],
    imageSizes: [64, 96, 128, 200, 280, 360],
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
  experimental: {
    globalNotFound: true,
    // 6 languages ≈ 360 prerendered pages: a few build workers keep memory and DB connections bounded on small servers
    // (NEXT_BUILD_CPUS overrides; Next's default is every core minus one)
    cpus: Number(process.env.NEXT_BUILD_CPUS) || 4,
    // inlineCss was measured OFF in Sprint 4+5: inlining duplicated the whole stylesheet into the RSC payload (HTML 51→24 KiB,
    // TBT 170–210→30–40 ms, mobile perf +3 when off). The single stylesheet is small and immutable-cached.
    inlineCss: false,
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/admin/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }, { key: "Cache-Control", value: "no-store" }] },
      { source: "/upload/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=2592000" }, ...(indexable ? [] : [{ key: "X-Robots-Tag", value: "noindex, noimageindex" }])] },
    ];
  },
};

export default nextConfig;
