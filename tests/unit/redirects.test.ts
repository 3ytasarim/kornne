import { describe, expect, it } from "vitest";
import redirects from "@/data/redirects.json";
import { canonicalRedirectTarget, localizePath, resolvePublicPath } from "@/lib/i18n/routes";

const map = redirects as Record<string, string>;

describe("legacy redirect map", () => {
  // targets were written when Turkish was unprefixed; the proxy upgrades them with canonicalRedirectTarget (2026-11)
  it("has no chains and no loops (single-hop 301s)", () => {
    for (const [from, to] of Object.entries(map)) {
      const target = canonicalRedirectTarget(to);
      expect(target, from).not.toBe(from);
      expect(map[target], `${from} → ${target} chains`).toBeUndefined();
    }
  });

  it("upgraded targets are canonical public URLs of the new site", () => {
    for (const to of Object.values(map)) {
      const target = canonicalRedirectTarget(to);
      const { locale, internalPath } = resolvePublicPath(target.split(/[?#]/)[0]!);
      expect(localizePath(locale, internalPath)).toBe(target.split(/[?#]/)[0]);
    }
  });

  it("never redirects a Turkish product URL (same slug is kept)", () => {
    expect(Object.keys(map).filter((k) => k.startsWith("/urun/") && map[k]!.startsWith("/urun/"))).toEqual([]);
  });

  it("maps session-based language homes to prefixed locales", () => {
    expect(map["/lang-eng/"]).toBe("/en");
    expect(map["/lang-arabic/"]).toBe("/ar");
  });
});
