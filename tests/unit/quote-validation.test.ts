import { describe, expect, it } from "vitest";
import { newReference } from "@/lib/quote/service";
import { quoteInputSchema } from "@/lib/quote/validation";

const base = {
  locale: "tr" as const,
  name: "Ayşe Yılmaz",
  email: "ayse@example.com",
  items: [{ productRef: "78", quantity: 2 }],
  idempotencyKey: "0b5f4c1e-9a7d-4c4e-8d0e-1f2a3b4c5d6e",
  startedAt: Date.now() - 10_000,
};

describe("quote input validation", () => {
  it("accepts a minimal valid request and normalises empty optionals to null", () => {
    const r = quoteInputSchema.parse({ ...base, company: "", phone: "" });
    expect(r.company).toBeNull();
    expect(r.phone).toBeNull();
    expect(r.items[0]).toEqual({ productRef: "78", variantId: null, quantity: 2 });
  });

  it("requires an e-mail or a phone", () => {
    const r = quoteInputSchema.safeParse({ ...base, email: "" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe("contactRequired");
    expect(quoteInputSchema.safeParse({ ...base, email: "", phone: "+90 535 000 00 00" }).success).toBe(true);
  });

  it("rejects invalid quantities (0, negative, huge, fractional)", () => {
    for (const quantity of [0, -3, 1000, 1_000_000, 2.5]) expect(quoteInputSchema.safeParse({ ...base, items: [{ productRef: "78", quantity }] }).success, String(quantity)).toBe(false);
  });

  it("rejects malformed product refs (no injection through ids)", () => {
    for (const productRef of ["78; DROP TABLE x", "../78", "", "abc"]) expect(quoteInputSchema.safeParse({ ...base, items: [{ productRef, quantity: 1 }] }).success).toBe(false);
  });

  it("limits the number of lines", () => {
    const items = Array.from({ length: 51 }, (_, i) => ({ productRef: String(100 + i), quantity: 1 }));
    expect(quoteInputSchema.safeParse({ ...base, items }).success).toBe(false);
    expect(quoteInputSchema.safeParse({ ...base, items: [] }).success).toBe(false);
  });

  it("keeps HTML as inert text (escaped on render), strips control characters", () => {
    const r = quoteInputSchema.parse({ ...base, message: "<script>alert(1)</script>\u0000\u0007ok" });
    expect(r.message).toBe("<script>alert(1)</script>ok");
  });

  it("rejects bad e-mail / phone formats", () => {
    expect(quoteInputSchema.safeParse({ ...base, email: "not-an-email" }).success).toBe(false);
    expect(quoteInputSchema.safeParse({ ...base, phone: "12" }).success).toBe(false);
  });

  it("reference codes are unambiguous and dated", () => {
    const ref = newReference(new Date("2026-10-22T10:00:00Z"));
    expect(ref).toMatch(/^TKL-20261022-[2-9A-HJ-NP-Z]{6}$/);
  });
});
