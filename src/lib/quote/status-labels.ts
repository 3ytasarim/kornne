/** Turkish labels for QuoteStatus (admin UI). RESPONDED = sent to the customer OUTSIDE the panel (no e-mail provider). */
export const STATUS_LABEL: Record<string, string> = {
  NEW: "Yeni",
  IN_REVIEW: "İnceleniyor",
  QUOTE_PREPARED: "Teklif hazırlandı",
  RESPONDED: "Müşteriye iletildi",
  CLOSED: "Sonuçlandı",
  SPAM: "Spam",
};

export const STATUS_TONE: Record<string, "neutral" | "brand" | "success" | "warning" | "outline"> = {
  NEW: "brand",
  IN_REVIEW: "warning",
  QUOTE_PREPARED: "warning",
  RESPONDED: "success",
  CLOSED: "neutral",
  SPAM: "outline",
};

export const OUTCOME_LABEL: Record<string, string> = { won: "Kazanıldı", lost: "Kaybedildi", no_response: "Yanıt gelmedi", duplicate: "Mükerrer talep" };
