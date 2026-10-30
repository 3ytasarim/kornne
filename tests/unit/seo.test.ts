import { describe, expect, it } from "vitest";
import { sanitizeRichText } from "@/lib/catalog/sanitize";
import { productJsonLd, serializeJsonLd } from "@/lib/seo/json-ld";

describe("JSON-LD", () => {
  it("cannot break out of the <script> element", () => {
    const out = serializeJsonLd({ name: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("</script>");
    expect(out).not.toContain("<");
  });

  it("emits no Offer and no rating without verified data", () => {
    const ld = productJsonLd({ name: "X", description: "d", path: "/urun/x", images: ["/upload/a.jpg"], locale: "tr", offer: null });
    expect(ld).not.toHaveProperty("offers");
    expect(JSON.stringify(ld)).not.toMatch(/aggregateRating|review/i);
  });

  it("emits a decimal price string when an offer is verified", () => {
    const ld = productJsonLd({ name: "X", description: "d", path: "/urun/x", images: [], locale: "tr", offer: { priceMinor: 77101n, currency: "TRY", availability: "InStock" } });
    expect(ld.offers).toMatchObject({ price: "771.01", priceCurrency: "TRY" });
  });
});

describe("rich text sanitizer", () => {
  it("strips scripts, inline styles and event handlers; demotes legacy <h1>", () => {
    const html = sanitizeRichText('<h1>Başlık</h1><p style="color:red" onclick="x()">Metin<script>alert(1)</script></p><img src=x onerror=y>');
    expect(html).toBe("<h2>Başlık</h2><p>Metin</p>");
  });

  it("drops empty &nbsp; paragraphs and javascript: links", () => {
    expect(sanitizeRichText("<p>&nbsp;</p><p><a href=\"javascript:alert(1)\">a</a></p>")).toBe('<p><a rel="noopener noreferrer nofollow">a</a></p>');
  });
});
