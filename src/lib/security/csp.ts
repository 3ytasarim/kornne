import { analyticsConfig, analyticsCspHosts } from "../analytics/config";

/**
 * Content-Security-Policy (Sprint 11). Enforced, built from the environment at build/start time.
 *
 * Why `script-src 'unsafe-inline'` and not nonces: storefront pages are statically generated (SSG/ISR) for speed;
 * a per-request nonce would force every page to dynamic rendering. Next's inline bootstrap scripts and the theme
 * initialiser are inline. The policy still blocks every EXTERNAL script origin except the Google tag hosts — and
 * those only when analytics is explicitly enabled. JSON-LD blocks are data, not executed.
 */
export function buildCsp(env: Partial<Record<string, string | undefined>> = process.env): string {
  const a = analyticsCspHosts(analyticsConfig(env));
  const dev = env.NODE_ENV !== "production";
  const d: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : []), ...a.script],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", ...a.img],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", ...a.connect, ...(dev ? ["ws:"] : [])],
    "frame-src": ["'none'"],
    "frame-ancestors": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'", "https://wa.me", "https://api.whatsapp.com"],
    "manifest-src": ["'self'"],
    "worker-src": ["'self'", "blob:"],
  };
  // only on HTTPS origins: on plain-http hosts (local preview, tests) WebKit upgrades every subresource and breaks the
  // page (found by the Sprint 10 WebKit run; Chrome exempts localhost)
  const https = (env.SITE_URL ?? "").startsWith("https://");
  return [...Object.entries(d).map(([k, v]) => `${k} ${v.join(" ")}`), ...(https ? ["upgrade-insecure-requests"] : [])].join("; ");
}
