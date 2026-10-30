import type { BadgeTone } from "@/components/ui/Badge";

export const ORDER_STATUS_TR: Record<string, string> = {
  AWAITING_PAYMENT: "Ödeme bekleniyor",
  PAID: "Ödendi",
  PROCESSING: "Hazırlanıyor",
  SHIPPED: "Sevk edildi",
  DELIVERED: "Teslim edildi",
  CANCELLED: "İptal",
  REFUNDED: "İade",
};

export const PAYMENT_STATUS_TR: Record<string, string> = { UNPAID: "Ödenmedi", NOTIFIED: "Bildirim var", PAID: "Ödendi", FAILED: "Başarısız", REFUNDED: "İade" };

export const NOTICE_STATUS_TR: Record<string, string> = { PENDING: "Bekliyor", MATCHED: "Eşleşti", REJECTED: "Reddedildi" };

export function orderTone(status: string): BadgeTone {
  if (status === "AWAITING_PAYMENT") return "warning";
  if (status === "CANCELLED" || status === "REFUNDED") return "outline";
  if (status === "DELIVERED") return "success";
  return "brand";
}
