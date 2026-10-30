/**
 * Analytics / Search Console configuration (Sprint 10) — environment only, DISABLED by default. Nothing here creates
 * a Google property, container or tag; ids come from the client's EXISTING accounts once access is granted.
 *
 *   ANALYTICS_ENABLED=true                 explicit opt-in per environment (staging should use its own property)
 *   ANALYTICS_GA4_MEASUREMENT_ID=G-XXXX    gtag.js mode, or
 *   ANALYTICS_GTM_CONTAINER_ID=GTM-XXXX    Tag Manager mode (wins when both are set)
 *   COOKIE_POLICY_APPROVED=true            only after legal approval of the cookie / KVKK texts (banner shows "draft")
 *   GOOGLE_SITE_VERIFICATION=<token>       Search Console HTML-tag verification (meta tag), rendered only if set
 */
export type AnalyticsConfig = { enabled: boolean; mode: "gtm" | "gtag" | null; id: string | null; legalApproved: boolean; problems: string[] };

type Env = Partial<Record<string, string | undefined>>;

export function analyticsConfig(env: Env = process.env): AnalyticsConfig {
  const problems: string[] = [];
  const gtm = env.ANALYTICS_GTM_CONTAINER_ID?.trim() || "";
  const ga4 = env.ANALYTICS_GA4_MEASUREMENT_ID?.trim() || "";
  const gtmOk = /^GTM-[A-Z0-9]{4,12}$/.test(gtm);
  const ga4Ok = /^G-[A-Z0-9]{4,14}$/.test(ga4);
  if (gtm && !gtmOk) problems.push("ANALYTICS_GTM_CONTAINER_ID biçimi geçersiz (GTM-XXXXXXX)");
  if (ga4 && !ga4Ok) problems.push("ANALYTICS_GA4_MEASUREMENT_ID biçimi geçersiz (G-XXXXXXXXXX)");
  const wanted = env.ANALYTICS_ENABLED === "true";
  if (wanted && !gtmOk && !ga4Ok) problems.push("ANALYTICS_ENABLED=true ama geçerli bir GA4/GTM kimliği yok");
  const mode = gtmOk ? "gtm" : ga4Ok ? "gtag" : null;
  const enabled = wanted && mode !== null;
  return { enabled, mode: enabled ? mode : null, id: enabled ? (gtmOk ? gtm : ga4) : null, legalApproved: env.COOKIE_POLICY_APPROVED === "true", problems };
}

export function siteVerificationToken(env: Env = process.env): string | null {
  const t = env.GOOGLE_SITE_VERIFICATION?.trim();
  return t && /^[A-Za-z0-9_-]{10,100}$/.test(t) ? t : null;
}

/** Hosts the CSP must allow for the configured mode (none when analytics is off). */
export function analyticsCspHosts(c: AnalyticsConfig): { script: string[]; connect: string[]; img: string[] } {
  if (!c.enabled) return { script: [], connect: [], img: [] };
  const g = ["https://www.googletagmanager.com"];
  const collect = ["https://*.google-analytics.com", "https://*.analytics.google.com", "https://www.googletagmanager.com"];
  return { script: g, connect: collect, img: [...collect] };
}
