import { CONSENT_DEFAULTS, consentModeState, type Consent } from "./consent";
import { sanitizeEvent, type EventName } from "./events";

/**
 * Browser runtime (Sprint 10). Nothing happens unless the server enabled analytics AND the visitor granted the
 * analytics category: before that, `track()` is a no-op and no Google script exists on the page (basic consent
 * mode). Every event passes sanitizeEvent() — unknown / commerce events and personal data are dropped.
 */
type Runtime = { mode: "gtag" | "gtm"; id: string; consent: Consent | null; loaded: boolean };
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    __kornneAnalytics?: Runtime;
  }
}

export function initRuntime(mode: "gtag" | "gtm", id: string, consent: Consent | null) {
  if (typeof window === "undefined") return;
  window.__kornneAnalytics ??= { mode, id, consent: null, loaded: false };
  applyConsent(consent);
}

function ensureGtag() {
  window.dataLayer ??= [];
  window.gtag ??= function gtag() {
    // gtag.js requires the Arguments object itself (not an array)
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  return window.gtag;
}

function loadScript(src: string) {
  if (document.querySelector(`script[data-kornne-analytics]`)) return;
  const s = document.createElement("script");
  s.async = true;
  s.src = src;
  s.dataset.kornneAnalytics = "1";
  document.head.appendChild(s);
}

/** Removes Google Analytics cookies on withdrawal (best effort; they are first-party on this host). */
function clearGaCookies() {
  for (const c of document.cookie.split(/;\s*/)) {
    const name = c.split("=")[0] ?? "";
    if (/^(_ga|_gid|_gat)/.test(name)) {
      const host = location.hostname;
      for (const domain of ["", `; domain=${host}`, `; domain=.${host.replace(/^www\./, "")}`]) document.cookie = `${name}=; Max-Age=0; Path=/${domain}`;
    }
  }
}

export function applyConsent(consent: Consent | null) {
  const rt = window.__kornneAnalytics;
  if (!rt) return;
  const before = rt.consent;
  rt.consent = consent;
  if (!consent?.analytics) {
    if (rt.loaded) {
      ensureGtag()("consent", "update", consentModeState({ analytics: false, marketing: false }));
      clearGaCookies();
    }
    return;
  }
  const gtag = ensureGtag();
  if (!rt.loaded) {
    // Consent Mode v2 order: defaults (all denied) → update from the visitor's choice → tag configuration
    gtag("consent", "default", { ...CONSENT_DEFAULTS, wait_for_update: 500 });
    gtag("consent", "update", consentModeState(consent));
    gtag("set", { url_passthrough: false, ads_data_redaction: true });
    if (rt.mode === "gtag") {
      gtag("js", new Date());
      gtag("config", rt.id, { send_page_view: false, allow_google_signals: consent.marketing, allow_ad_personalization_signals: consent.marketing });
      loadScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(rt.id)}`);
    } else {
      window.dataLayer!.push({ "gtm.start": Date.now(), event: "gtm.js" });
      loadScript(`https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(rt.id)}`);
    }
    rt.loaded = true;
  } else if (before?.analytics !== consent.analytics || before?.marketing !== consent.marketing) {
    gtag("consent", "update", consentModeState(consent));
  }
}

export function track(name: EventName | string, params: Record<string, unknown> = {}): boolean {
  if (typeof window === "undefined") return false;
  const rt = window.__kornneAnalytics;
  if (!rt?.loaded || !rt.consent?.analytics) return false;
  const ev = sanitizeEvent(name, params);
  if (!ev) return false;
  if (rt.mode === "gtm") window.dataLayer!.push({ event: ev.name, ...ev.params });
  else ensureGtag()("event", ev.name, ev.params);
  return true;
}

/** generate_lead exactly once per stored quote (double click, re-render or back/forward cannot repeat it). */
export function trackLeadOnce(reference: string, params: { lead_source: string; items_count: number }): boolean {
  const key = `kornne_lead_${reference.replace(/[^A-Za-z0-9-]/g, "").slice(0, 40)}`;
  try {
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, "1");
  } catch {
    /* storage blocked: still send once for this page life */
  }
  return track("generate_lead", params);
}
