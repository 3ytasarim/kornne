import { describe, expect, it } from "vitest";
import { proposalSchema, vatRateToBp, livePrice } from "@/lib/admin/prices";
import { canMoveQuote, contactKey, csvCell, maskEmail, maskPhone, toCsv } from "@/lib/admin/quotes";
import { safeFileName, sniffType } from "@/lib/admin/media";
import { analyzeRedirects } from "@/lib/admin/redirect-check";
import { slugify, SLUG_RE } from "@/lib/admin/products";
import { matchRequirements } from "@/lib/admin/translations";
import { ACTIONS, allowed, can, MODULE_ACCESS, ROLES, type Role } from "@/lib/auth/rbac";
import { linkProblem } from "@/lib/cms/service";
import { settingProblem } from "@/lib/cms/settings";

describe("RBAC matrix (deny by default, least privilege)", () => {
  it("every action lists only real roles; unknown actions are denied to everyone", () => {
    for (const roles of Object.values(ACTIONS)) for (const r of roles) expect(ROLES).toContain(r);
    for (const r of ROLES) expect(allowed(r, "something.unknown")).toBe(false);
  });
  it("approvals and exports are restricted", () => {
    const who = (a: keyof typeof ACTIONS) => ROLES.filter((r) => allowed(r, a)).sort();
    expect(who("price.approve")).toEqual(["ADMIN", "SUPER_ADMIN"]);
    expect(who("price.propose")).toEqual(["ADMIN", "PRODUCT_EDITOR", "SUPER_ADMIN"]);
    expect(who("product.review_clear")).toEqual(["ADMIN", "SUPER_ADMIN"]);
    expect(who("quote.export")).toEqual(["ADMIN", "SUPER_ADMIN"]);
    expect(who("quote.manage")).toEqual(["ADMIN", "ORDER_OPERATOR", "SUPER_ADMIN"]);
    expect(who("content.publish")).toEqual(["ADMIN", "SUPER_ADMIN"]);
    expect(who("content.edit")).toEqual(["ADMIN", "SEO_EDITOR", "SUPER_ADMIN"]);
    expect(who("user.manage")).toEqual(["SUPER_ADMIN"]);
    expect(who("settings.verify")).toEqual(["SUPER_ADMIN"]);
  });
  it("roles cannot reach modules outside their job", () => {
    const deny: [Role, string][] = [
      ["PRODUCT_EDITOR", "quotes"],
      ["PRODUCT_EDITOR", "users"],
      ["PRODUCT_EDITOR", "content"],
      ["ORDER_OPERATOR", "products"],
      ["ORDER_OPERATOR", "pricing"],
      ["SEO_EDITOR", "quotes"],
      ["SEO_EDITOR", "pricing"],
      ["ADMIN", "users"],
    ];
    for (const [r, m] of deny) expect(can(r, m as never), `${r} → ${m}`).toBe(false);
    expect(MODULE_ACCESS.SUPER_ADMIN.length).toBe(16);
  });
  it("PII-bearing operations never go to catalog / SEO roles", () => {
    for (const a of ["quote.view_pii", "customer.view_pii", "quote.export"] as const) {
      expect(allowed("PRODUCT_EDITOR", a)).toBe(false);
      expect(allowed("SEO_EDITOR", a)).toBe(false);
    }
  });
});

describe("price proposals", () => {
  const base = { productId: "c".repeat(25), amount: "1.250.000,00", currency: "TRY", vatMode: "included", vatRate: "20", evidence: "Müşteri fiyat listesi 2026-11" };
  it("parses Turkish amounts to kuruş and VAT to basis points", () => {
    const v = proposalSchema.parse(base);
    expect(v.amountMinor).toBe(125_000_000n);
    expect(v.vatRateBp).toBe(2000);
    expect(vatRateToBp("%8")).toBe(800);
    expect(vatRateToBp("20,5")).toBe(2050);
    expect(vatRateToBp("101")).toBeNull();
    expect(vatRateToBp("abc")).toBeNull();
  });
  it("refuses a 'was' price that is not higher (no fake / negative discount), missing VAT and missing evidence", () => {
    expect(() => proposalSchema.parse({ ...base, compareAt: "1.250.000,00" })).toThrow(/Eski fiyat/);
    expect(() => proposalSchema.parse({ ...base, compareAt: "900.000" })).toThrow(/Eski fiyat/);
    expect(proposalSchema.parse({ ...base, compareAt: "1.500.000" }).compareAtMinor).toBe(150_000_000n);
    expect(() => proposalSchema.parse({ ...base, vatMode: "" })).toThrow();
    expect(() => proposalSchema.parse({ ...base, evidence: "" })).toThrow(/kaynağını/);
    expect(() => proposalSchema.parse({ ...base, amount: "-5" })).toThrow();
    expect(() => proposalSchema.parse({ ...base, amount: "1.2.3" })).toThrow();
    expect(() => proposalSchema.parse({ ...base, validFrom: "2026-12-01", validTo: "2026-11-01" })).toThrow(/Bitiş/);
  });
  it("the live price is the newest VERIFIED one inside its validity window", () => {
    const now = new Date("2026-10-22T12:00:00Z");
    const rows = [
      { id: "old", status: "VERIFIED", validFrom: new Date("2026-01-01"), validTo: new Date("2026-06-01") },
      { id: "future", status: "VERIFIED", validFrom: new Date("2026-12-01"), validTo: null },
      { id: "pending", status: "UNVERIFIED", validFrom: new Date("2026-10-01"), validTo: null },
      { id: "live", status: "VERIFIED", validFrom: new Date("2026-09-01"), validTo: null },
    ];
    expect(livePrice(rows, now)?.id).toBe("live");
    expect(livePrice(rows.filter((r) => r.id !== "live"), now)).toBeNull();
  });
});

describe("quote CRM helpers", () => {
  it("only allows the documented status transitions", () => {
    expect(canMoveQuote("NEW", "IN_REVIEW")).toBe(true);
    expect(canMoveQuote("NEW", "RESPONDED")).toBe(false);
    expect(canMoveQuote("NEW", "CLOSED")).toBe(false);
    expect(canMoveQuote("IN_REVIEW", "QUOTE_PREPARED")).toBe(true);
    expect(canMoveQuote("QUOTE_PREPARED", "RESPONDED")).toBe(true);
    expect(canMoveQuote("CLOSED", "NEW")).toBe(false);
    expect(canMoveQuote("CLOSED", "IN_REVIEW")).toBe(true);
  });
  it("CSV cells cannot inject spreadsheet formulas and are quoted safely", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell("+90 500")).toBe("'+90 500");
    expect(csvCell("-1")).toBe("'-1");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell("a;b")).toBe('"a;b"');
    expect(csvCell(null)).toBe("");
    expect(toCsv([["a", "b"]]).startsWith("﻿")).toBe(true);
  });
  it("masks contact data for lists and keys contacts without exposing them", () => {
    expect(maskEmail("ahmet.yilmaz@kornne.com")).toBe("a***@k***.com");
    expect(maskPhone("+90 535 406 80 02")).toBe("*** *** 02");
    expect(contactKey("A@B.com", null)).toBe(contactKey("a@b.com", null));
    expect(contactKey("a@b.com", null)).toMatch(/^[a-f0-9]{24}$/);
    expect(contactKey(null, "+90 (535) 406")).toBe(contactKey(null, "90535406"));
  });
});

describe("uploads", () => {
  const bytes = (...b: number[]) => new Uint8Array(b);
  it("detects the real type from the content, not the name", () => {
    expect(sniffType(bytes(0xff, 0xd8, 0xff, 0xe0))?.mime).toBe("image/jpeg");
    expect(sniffType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))?.mime).toBe("image/png");
    expect(sniffType(new TextEncoder().encode("RIFF1234WEBPVP8 "))?.mime).toBe("image/webp");
    expect(sniffType(new TextEncoder().encode("GIF89a..."))?.mime).toBe("image/gif");
    expect(sniffType(new TextEncoder().encode("%PDF-1.7"))?.mime).toBe("application/pdf");
    expect(sniffType(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"))).toBeNull();
    expect(sniffType(new TextEncoder().encode("<html><script>"))).toBeNull();
    expect(sniffType(bytes())).toBeNull();
  });
  it("generates file names without user-controlled path segments", () => {
    const n = safeFileName("../../etc/passwd Döş Açma (1).JPG", "a".repeat(64), "jpg");
    expect(n).toMatch(/^kornne-[a-z0-9-]+-a{10}\.jpg$/);
    expect(n).not.toContain("/");
    expect(n).not.toContain("..");
  });
});

describe("redirect health", () => {
  it("finds loops, chains and self-redirects", () => {
    const issues = analyzeRedirects([
      { fromPath: "/a", toPath: "/b", active: true },
      { fromPath: "/b", toPath: "/a", active: true },
      { fromPath: "/c", toPath: "/d", active: true },
      { fromPath: "/d", toPath: "/e", active: true },
      { fromPath: "/s", toPath: "/s/", active: true },
      { fromPath: "/x", toPath: "/y", active: false },
      { fromPath: "/ok", toPath: "/target", active: true },
    ]);
    expect(issues.find((i) => i.fromPath === "/a")?.kind).toBe("loop");
    expect(issues.find((i) => i.fromPath === "/c")?.kind).toBe("chain");
    expect(issues.find((i) => i.fromPath === "/s")?.kind).toBe("self");
    expect(issues.some((i) => i.fromPath === "/ok" || i.fromPath === "/x")).toBe(false);
  });
});

describe("slugs, links, settings, match risk", () => {
  it("Turkish-aware slugs", () => {
    expect(slugify("Döş Açma Testeresi")).toBe("dos-acma-testeresi");
    expect(slugify("İkiz Ray Kancası — Paslanmaz")).toBe("ikiz-ray-kancasi-paslanmaz");
    expect(SLUG_RE.test("a--b")).toBe(false);
    expect(SLUG_RE.test("dairesel-kesim-hucresi")).toBe(true);
  });
  it("menu / banner links: internal paths or https only", () => {
    expect(linkProblem("/kategori/tum-urunler")).toBeNull();
    expect(linkProblem("https://www.youtube.com/@KornneTech")).toBeNull();
    expect(linkProblem("javascript:alert(1)")).not.toBeNull();
    expect(linkProblem("//evil.example")).not.toBeNull();
    expect(linkProblem("http://insecure.example")).not.toBeNull();
  });
  it("settings validation", () => {
    expect(settingProblem("contact.email", "info@kornne.com")).toBeNull();
    expect(settingProblem("contact.email", "nope")).not.toBeNull();
    expect(settingProblem("contact.phoneE164", "0535")).not.toBeNull();
    expect(settingProblem("social.youtube", "http://x")).not.toBeNull();
  });
  it("flags low-confidence and customer-decision matches", () => {
    expect(matchRequirements({ confidence: 20, evidence: { trTitle: "Kurban Yatırma Kabini", legacyTitle: "Sacrifice Laying Cabin", priceEqual: false } })).toEqual({ lowConfidence: true, customerDecision: true, priceConflict: true });
    expect(matchRequirements({ confidence: 95, evidence: { trTitle: "Dairesel Kesim Hücresi", legacyTitle: "Circular Cutting Cell", priceEqual: true } })).toEqual({ lowConfidence: false, customerDecision: false, priceConflict: false });
  });
});
