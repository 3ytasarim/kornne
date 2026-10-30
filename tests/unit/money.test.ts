import { describe, expect, it } from "vitest";
import { discountPercent, formatMoney, parseMinor, toDecimalString } from "@/lib/money";

describe("money (integer kuruş, no floats)", () => {
  it("parses decimal strings and Turkish formatted prices", () => {
    expect(parseMinor("1807479.94")).toBe(180747994n);
    expect(parseMinor("1.807.479,94 TL")).toBe(180747994n);
    expect(parseMinor("771,01 TL")).toBe(77101n);
    expect(parseMinor("887")).toBe(88700n);
    expect(parseMinor("")).toBeNull();
    expect(parseMinor("abc")).toBeNull();
  });

  it("round-trips to the schema.org / Merchant decimal format", () => {
    expect(toDecimalString(180747994n)).toBe("1807479.94");
    expect(toDecimalString(5n)).toBe("0.05");
  });

  it("formats for display per locale", () => {
    expect(formatMoney(180747994n, "TRY", "tr")).toBe("1.807.479,94 TL");
    expect(formatMoney(77101n, "TRY", "en")).toContain("771.01");
  });

  it("only shows a discount when the previous price is really higher (legacy -%0 / negative labels)", () => {
    expect(discountPercent(180747994n, 190342205n)).toBe(5);
    expect(discountPercent(313221n, 313221n)).toBeNull(); // legacy "%0"
    expect(discountPercent(433691n, 366228n)).toBeNull(); // legacy "Lama ray kancası": old < new
    expect(discountPercent(null, 100n)).toBeNull();
  });
});
