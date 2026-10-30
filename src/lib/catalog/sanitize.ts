import sanitizeHtml from "sanitize-html";

/**
 * Allow-list sanitizer for legacy/admin rich text. Legacy descriptions contain an extra <h1> (second H1 on the page),
 * so headings are demoted: h1/h2 → h2, h3+ → h3.
 */
export function sanitizeRichText(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ["p", "br", "ul", "ol", "li", "strong", "b", "em", "i", "h2", "h3", "table", "thead", "tbody", "tr", "th", "td", "a"],
    allowedAttributes: { a: ["href", "rel", "target"] },
    allowedSchemes: ["https", "mailto", "tel"],
    transformTags: {
      h1: "h2",
      h4: "h3",
      h5: "h3",
      h6: "h3",
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer nofollow" }),
    },
    exclusiveFilter: (frame) => frame.tag === "p" && !frame.text.replace(/ /g, " ").trim() && !frame.mediaChildren.length,
  }).trim();
}
