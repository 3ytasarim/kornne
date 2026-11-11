import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/cookie";
import { findRedirect } from "@/lib/redirects";
import { isEnabledLocale, LOCALE_HEADER } from "@/lib/i18n/config";
import { canonicalRedirectTarget, legacyTurkishPath, localizePath, resolvePublicPath } from "@/lib/i18n/routes";

/**
 * Next 16 proxy (Node runtime). Order:
 *  1. Staging Basic Auth (when STAGING_BASIC_AUTH_* are set) — everything except the health check.
 *  2. /admin: session-cookie gate (convenience only; every admin page/action re-validates the DB session).
 *  3. Legacy 301s: DB Redirect table (imported from docs/audit/redirect-map.csv, updated by Catalog QA approvals),
 *     static src/data/redirects.json as fallback (src/lib/redirects.ts, 60 s memo).
 *  4. Old unprefixed Turkish URLs ("/urun/x", from before English became the default locale in 2026-11) → 301
 *     "/tr/urun/x". Legacy-redirect targets written in that old scheme are upgraded the same way (one hop).
 *  5. Trailing slash → 308; "/en/..." → 308 to the unprefixed English URL.
 *  6. Locale rewrite: public "/de/produkt/x" → internal "/de/urun/x" (app/[locale]/...); English (no prefix) →
 *     "/en/...".
 * Non-indexable environments get "X-Robots-Tag: noindex" on every response (incl. images and files).
 */
const INDEXABLE = process.env.SITE_INDEXABLE === "true";

function siteBase(request: NextRequest): string {
  // Behind Nginx request.url may be http://127.0.0.1:<port>; redirects must use the public origin.
  return process.env.NODE_ENV === "production" && process.env.SITE_URL ? process.env.SITE_URL.replace(/\/+$/, "") : new URL(request.url).origin;
}

function withRobots(res: NextResponse): NextResponse {
  if (!INDEXABLE) res.headers.set("X-Robots-Tag", "noindex, nofollow, noimageindex");
  return res;
}

function basicAuthOk(request: NextRequest): boolean {
  const user = process.env.STAGING_BASIC_AUTH_USER;
  const pass = process.env.STAGING_BASIC_AUTH_PASSWORD;
  if (!user || !pass) return true;
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Basic ")) return false;
  let decoded = "";
  try {
    decoded = atob(header.slice(6));
  } catch {
    return false;
  }
  const expected = `${user}:${pass}`;
  // length-independent comparison
  let diff = decoded.length ^ expected.length;
  for (let i = 0; i < Math.max(decoded.length, expected.length); i++) diff |= (decoded.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
  return diff === 0;
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const base = siteBase(request);

  if (pathname !== "/api/health" && !basicAuthOk(request)) {
    return new NextResponse("Authentication required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="KORNNE staging", charset="UTF-8"', "X-Robots-Tag": "noindex, nofollow" } });
  }

  if (pathname.startsWith("/api/")) return withRobots(NextResponse.next());

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    const publicAdmin = pathname === "/admin/login" || pathname.startsWith("/admin/davet/");
    const res = !publicAdmin && !request.cookies.has(SESSION_COOKIE) ? NextResponse.redirect(new URL("/admin/login", base)) : NextResponse.next();
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
    return res;
  }

  let decodedPath = pathname;
  try {
    decodedPath = decodeURI(pathname);
  } catch {
    /* malformed escape → keep raw */
  }
  const legacy = await findRedirect(decodedPath);
  if (legacy && legacy.to !== decodedPath) {
    // targets were written for the old scheme (bare Turkish, "/en/..." English) → today's URL, still one hop
    const target = new URL(encodeURI(canonicalRedirectTarget(legacy.to)), base);
    if (search) target.search = search;
    return withRobots(NextResponse.redirect(target, legacy.status));
  }

  const oldTurkish = legacyTurkishPath(decodedPath);
  if (oldTurkish) return withRobots(NextResponse.redirect(new URL(encodeURI(oldTurkish) + search, base), 301));

  const { locale, internalPath } = resolvePublicPath(decodedPath);
  if (!isEnabledLocale(locale)) return withRobots(NextResponse.next());
  // One public URL per page, reached in ONE hop: trailing "/" removed, "/en/x" → "/x", "/de/urun/x" → "/de/produkt/x"
  const canonicalPath = localizePath(locale, internalPath);
  if (canonicalPath !== decodedPath) {
    return withRobots(NextResponse.redirect(new URL(encodeURI(canonicalPath) + search, base), 308));
  }

  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${internalPath === "/" ? "" : internalPath}`;
  // Locale for param-less special files (not-found). Always overwritten here → clients cannot spoof it.
  const headers = new Headers(request.headers);
  headers.set(LOCALE_HEADER, locale);
  return withRobots(NextResponse.rewrite(url, { request: { headers } }));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|brand/|upload/|robots.txt|sitemap.xml|llms.txt).*)"],
};
