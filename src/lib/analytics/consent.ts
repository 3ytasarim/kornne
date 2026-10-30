/**
 * Consent state (Sprint 10) — first-party cookie `kornne_consent`, Google Consent Mode v2 mapping. Pure module.
 * Format: v<version>.a<0|1>.m<0|1>.<epoch days>  e.g. "v1.a1.m0.20384". A new CONSENT_VERSION asks again.
 *
 * Mode: "basic" consent mode — NO Google script is loaded before an explicit choice, and none at all after a
 * rejection. After acceptance the defaults are still sent as denied first, then updated (Google's required order).
 */
export const CONSENT_COOKIE = "kornne_consent";
export const CONSENT_VERSION = 1;
export const CONSENT_MAX_AGE_DAYS = 180;

export type Consent = { analytics: boolean; marketing: boolean; decidedAt: number };
export type ConsentModeState = { analytics_storage: "granted" | "denied"; ad_storage: "granted" | "denied"; ad_user_data: "granted" | "denied"; ad_personalization: "granted" | "denied" };

export function serializeConsent(c: Omit<Consent, "decidedAt">, now = Date.now()): string {
  return `v${CONSENT_VERSION}.a${c.analytics ? 1 : 0}.m${c.marketing ? 1 : 0}.${Math.floor(now / 86_400_000)}`;
}

/** null = no (valid, current-version, unexpired) decision → ask. */
export function parseConsent(raw: string | null | undefined, now = Date.now()): Consent | null {
  const m = raw?.match(/^v(\d+)\.a([01])\.m([01])\.(\d{1,6})$/);
  if (!m || Number(m[1]) !== CONSENT_VERSION) return null;
  const decidedAt = Number(m[4]) * 86_400_000;
  if (decidedAt > now + 86_400_000 || now - decidedAt > CONSENT_MAX_AGE_DAYS * 86_400_000) return null;
  return { analytics: m[2] === "1", marketing: m[3] === "1", decidedAt };
}

export function readConsentCookie(cookieString: string): Consent | null {
  const raw = cookieString.split(/;\s*/).find((c) => c.startsWith(`${CONSENT_COOKIE}=`))?.slice(CONSENT_COOKIE.length + 1);
  return parseConsent(raw ? decodeURIComponent(raw) : null);
}

export function consentCookieString(c: Omit<Consent, "decidedAt">, secure: boolean, now = Date.now()): string {
  return `${CONSENT_COOKIE}=${serializeConsent(c, now)}; Max-Age=${CONSENT_MAX_AGE_DAYS * 86_400}; Path=/; SameSite=Lax${secure ? "; Secure" : ""}`;
}

/** Everything denied until the visitor decides (Google Consent Mode v2 defaults). */
export const CONSENT_DEFAULTS: ConsentModeState = { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" };

export function consentModeState(c: Pick<Consent, "analytics" | "marketing">): ConsentModeState {
  const ads = c.marketing ? "granted" : "denied";
  return { analytics_storage: c.analytics ? "granted" : "denied", ad_storage: ads, ad_user_data: ads, ad_personalization: ads };
}
