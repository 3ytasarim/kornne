import { describe, expect, it } from "vitest";
import { convertMinor, displayCurrency, parseRate4, parseTcmbXml } from "@/lib/fx/convert";

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<Tarih_Date Tarih="10.11.2026" Date="11/10/2026" Bulten_No="2026/214">
  <Currency CrossOrder="0" Kod="USD" CurrencyCode="USD"><Unit>1</Unit><ForexBuying>50.1078</ForexBuying><ForexSelling>50.1981</ForexSelling></Currency>
  <Currency CrossOrder="9" Kod="EUR" CurrencyCode="EUR"><Unit>1</Unit><ForexBuying>56.2780</ForexBuying><ForexSelling>56.3795</ForexSelling></Currency>
</Tarih_Date>`;

describe("FX (TCMB ForexSelling)", () => {
  it("parses the TCMB bulletin: selling rates × 10000 and the bulletin date", () => {
    expect(parseTcmbXml(XML)).toEqual({ USD: 501981, EUR: 563795, bulletinDate: "10.11.2026" });
    expect(parseTcmbXml("<html>maintenance</html>")).toBeNull();
    expect(parseRate4("34,5")).toBe(345000);
    expect(parseRate4("abc")).toBeNull();
  });

  it("converts exactly in minor units with half-up rounding; missing rate → null (never a wrong price)", () => {
    const rates = { USD: 501981, EUR: 563795 };
    expect(convertMinor(1000_00n, "USD", "TRY", rates)).toBe(50_198_10n); // $1,000 → 50.198,10 TL
    expect(convertMinor(50_198_10n, "TRY", "USD", rates)).toBe(1000_00n);
    expect(convertMinor(1_00n, "EUR", "USD", rates)).toBe(1_12n); // 56.3795 / 50.1981 = 1.1231…
    expect(convertMinor(123n, "TRY", "TRY", null)).toBe(123n);
    expect(convertMinor(123n, "USD", "TRY", null)).toBeNull();
  });

  it("Turkish pages show TRY, every other language USD", () => {
    expect(displayCurrency("tr")).toBe("TRY");
    for (const l of ["en", "de", "fr", "ru", "ar"]) expect(displayCurrency(l)).toBe("USD");
  });
});
