/**
 * Role-based access control (docs/architecture/admin-permission-matrix.md).
 *
 * Two layers, both enforced on the SERVER:
 *  - MODULES: which admin screens a role may open (pages call requireAdmin(module)).
 *  - PERMISSIONS: which operations a role may perform (every server action / route handler calls
 *    requirePermission(action)). Deny by default: an action missing from the table is allowed to nobody.
 * Hiding a menu entry is only a convenience; it is never the control.
 */
export const ROLES = ["SUPER_ADMIN", "ADMIN", "PRODUCT_EDITOR", "ORDER_OPERATOR", "SEO_EDITOR"] as const;
export type Role = (typeof ROLES)[number];

export const MODULES = ["dashboard", "products", "pricing", "inventory", "media", "orders", "quotes", "content", "translations", "seo", "redirects", "merchant", "customers", "settings", "users", "audit"] as const;
export type AdminModule = (typeof MODULES)[number];

const ALL = MODULES;
export const MODULE_ACCESS: Record<Role, readonly AdminModule[]> = {
  SUPER_ADMIN: ALL,
  ADMIN: ALL.filter((m) => m !== "users"),
  PRODUCT_EDITOR: ["dashboard", "products", "pricing", "inventory", "media", "translations"],
  ORDER_OPERATOR: ["dashboard", "orders", "quotes", "customers"],
  SEO_EDITOR: ["dashboard", "content", "translations", "seo", "redirects", "media"],
};
/** @deprecated kept for older imports — use MODULE_ACCESS */
export const PERMISSIONS = MODULE_ACCESS;

const SA = "SUPER_ADMIN" as const;
const A = "ADMIN" as const;
const PE = "PRODUCT_EDITOR" as const;
const OO = "ORDER_OPERATOR" as const;
const SEO = "SEO_EDITOR" as const;

/** Operation → roles allowed. Least privilege: approvals and PII exports sit with SUPER_ADMIN / ADMIN only. */
export const ACTIONS = {
  // catalog
  "product.edit": [SA, A, PE],
  "product.publish": [SA, A, PE],
  /** release a product held for review (e.g. #208) — a business decision, not an editing task */
  "product.review_clear": [SA, A],
  "product.archive": [SA, A, PE],
  "category.edit": [SA, A, PE],
  "spec.verify": [SA, A, PE],
  "document.manage": [SA, A, PE],
  // prices (four-eyes: approver ≠ proposer, enforced in the service)
  "price.propose": [SA, A, PE],
  "price.approve": [SA, A],
  // media
  "media.edit": [SA, A, PE, SEO],
  "media.upload": [SA, A, PE, SEO],
  // quotes / customers (PII)
  "quote.view": [SA, A, OO],
  "quote.view_pii": [SA, A, OO],
  "quote.manage": [SA, A, OO],
  "quote.export": [SA, A],
  "customer.view_pii": [SA, A, OO],
  // content
  "content.edit": [SA, A, SEO],
  "content.publish": [SA, A],
  "menu.edit": [SA, A, SEO],
  "banner.edit": [SA, A, SEO],
  "faq.edit": [SA, A, SEO],
  // translations / SEO
  "translation.decide": [SA, A, PE],
  "translation.publish": [SA, A, SEO],
  "seo.edit": [SA, A, SEO],
  "redirect.view": [SA, A, SEO],
  // system
  "settings.view": [SA, A],
  "settings.edit": [SA, A],
  /** marking company / legal / bank data as verified */
  "settings.verify": [SA],
  "user.manage": [SA],
  "audit.view": [SA, A],
  "orders.view": [SA, A, OO],
  // Sprint 12 — B2B orders by EFT/Havale
  "order.manage": [SA, A, OO],
  /** confirming an incoming bank transfer = money decision */
  "order.confirm_payment": [SA, A],
  "bank.manage": [SA, A],
  "merchant.view": [SA, A],
  // Sprint 8+9 — SEO QA and Merchant (nothing here writes to Google; exports contain URLs/product data only, no PII)
  "seo.audit": [SA, A, SEO],
  "seo.export": [SA, A, SEO],
  "media.audit": [SA, A, PE, SEO],
  /** readiness evaluation + feed preview (dry-run, admin-only) */
  "merchant.preview": [SA, A],
  /** MOCK/SIMULATED sync run and old item_id mapping preview — never contacts Google */
  "merchant.simulate": [SA, A],
} as const satisfies Record<string, readonly Role[]>;
export type AdminAction = keyof typeof ACTIONS;

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Süper Yönetici",
  ADMIN: "Yönetici",
  PRODUCT_EDITOR: "Ürün Editörü",
  ORDER_OPERATOR: "Sipariş Operatörü",
  SEO_EDITOR: "SEO / İçerik Editörü",
};

export function can(role: Role, module: AdminModule): boolean {
  return MODULE_ACCESS[role]?.includes(module) ?? false;
}

export function allowed(role: Role, action: AdminAction | string): boolean {
  const roles = (ACTIONS as Record<string, readonly Role[]>)[action];
  return !!roles && roles.includes(role);
}

export const isRole = (v: unknown): v is Role => typeof v === "string" && (ROLES as readonly string[]).includes(v);
