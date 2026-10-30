import { describe, expect, it } from "vitest";
import redirects from "@/data/redirects.json";
import { localizePath, resolvePublicPath } from "@/lib/i18n/routes";

const map = redirects as Record<string, string>;

describe("legacy redirect map", () => {
  it("has no chains and no loops (single-hop 301s)", () => {
    for (const [from, to] of Object.entries(map)) {
      expect(to, from).not.toBe(from);
      expect(map[to], `${from} → ${to} chains`).toBeUndefined();
    }
  });

  it("targets are canonical public URLs of the new site", () => {
    for (const to of Object.values(map)) {
      const { locale, internalPath } = resolvePublicPath(to);
      expect(localizePath(locale, internalPath)).toBe(to);
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
