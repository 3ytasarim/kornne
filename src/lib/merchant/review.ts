import type { Availability, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { AdminError } from "@/lib/admin/action-state";

/**
 * Bulk Merchant data review (Admin › Merchant › Toplu onay). An authorised person (merchant.approve: SUPER_ADMIN / ADMIN)
 * records the REAL stock state, lead time, brand and manufacturer part numbers of many products at once.
 *  - nothing is defaulted or generated: every value is typed or chosen by the approver, who confirms that it is real
 *    and names the source (evidence note) — the note and before/after values go to the audit log per product
 *  - MADE_TO_ORDER requires a lead time (it is sent to Google as in_stock + max_handling_time)
 *  - GTINs are never created here; "no identifier" (identifier_exists=no) is applied only to products with no GTIN/MPN
 *  - empty fields mean "leave unchanged"
 */
export const AVAILABILITY_CHOICES = ["IN_STOCK", "MADE_TO_ORDER", "OUT_OF_STOCK", "PREORDER", "BACKORDER", "UNKNOWN"] as const;
export const AVAILABILITY_LABEL: Record<(typeof AVAILABILITY_CHOICES)[number], string> = {
  IN_STOCK: "Stokta (hemen sevk)",
  MADE_TO_ORDER: "Siparişe üretilir (temin süresi zorunlu)",
  OUT_OF_STOCK: "Stokta yok / sipariş alınmıyor",
  PREORDER: "Ön sipariş",
  BACKORDER: "Tedarik bekleniyor",
  UNKNOWN: "Bilinmiyor (Google'a gönderilmez)",
};

const MPN_RE = /^[A-Za-z0-9][A-Za-z0-9 ._/-]{0,69}$/;
const optInt = z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number({ error: "Sayı girin" }).int("Tam gün girin").min(1, "En az 1 gün").max(365, "En fazla 365 gün").optional());
const optQty = z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number({ error: "Sayı girin" }).int("Tam sayı girin").min(0, "0 veya daha büyük").max(1_000_000).optional());
const optStr = z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : undefined), z.string().optional());

export const reviewSchema = z.object({
  productIds: z.array(z.string().min(1)).min(1, "En az bir ürün seçin").max(200),
  availability: z.preprocess((v) => (v === "" ? undefined : v), z.enum(AVAILABILITY_CHOICES).optional()),
  leadTimeDays: optInt,
  /** units on hand (informational; Google gets the availability state, not the count) */
  quantity: optQty,
  brand: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : undefined), z.string().min(2, "En az 2 karakter").max(70, "En fazla 70 karakter").optional()),
  identifierNone: z.boolean().default(false),
  /** per-product manufacturer part number typed by the approver (empty = unchanged) */
  mpn: z.record(z.string(), z.string()).default({}),
  confirm: z.literal(true, { error: "Bilgilerin gerçek olduğunu onaylayın" }),
  note: optStr.pipe(z.string({ error: "Kaynak / dayanak yazın (ör. üretim müdürü teyidi, tarih)" }).min(5, "Kaynak / dayanak yazın (ör. üretim müdürü teyidi, tarih)").max(500)),
});
export type ReviewInput = z.input<typeof reviewSchema>;

const slugify = (s: string) =>
  s.toLocaleLowerCase("tr").replace(/ı/g, "i").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "marka";

export async function applyMerchantReview(db: PrismaClient, actor: { id: string }, raw: ReviewInput) {
  const parsed = reviewSchema.safeParse(raw);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const i of parsed.error.issues) fields[String(i.path[0] ?? "form")] ??= i.message;
    throw new AdminError("Form hatalı.", fields);
  }
  const v = parsed.data;
  const mpn: Record<string, string> = {};
  for (const [id, val] of Object.entries(v.mpn)) {
    const s = val.trim();
    if (!s) continue;
    if (!v.productIds.includes(id)) continue; // only selected rows are touched
    if (!MPN_RE.test(s)) throw new AdminError(`Geçersiz MPN: "${s.slice(0, 40)}" (harf, rakam, boşluk . _ / - ; en fazla 70 karakter)`, { mpn: "Geçersiz MPN" });
    mpn[id] = s;
  }
  if (v.quantity === 0 && v.availability === "IN_STOCK") throw new AdminError("Adet 0 iken “Stokta” seçilemez.", { quantity: "Stokta için en az 1" });
  if (v.availability === undefined && v.leadTimeDays === undefined && v.quantity === undefined && !v.brand && !v.identifierNone && !Object.keys(mpn).length) throw new AdminError("Değiştirilecek bir alan seçin.");

  const products = await db.product.findMany({
    where: { id: { in: v.productIds }, archivedAt: null },
    select: { id: true, sourceKey: true, gtin: true, mpn: true, identifierExists: true, brandId: true, inventory: { where: { variantId: null }, select: { id: true, availability: true, leadTimeDays: true, quantity: true } } },
  });
  if (products.length !== new Set(v.productIds).size) throw new AdminError("Seçilen ürünlerden biri bulunamadı (arşivlenmiş olabilir).");

  // made to order without a real lead time would be sent as a bare "in stock" — refused up front, nothing written
  const missingLead = products.filter((p) => {
    const avail = v.availability ?? p.inventory[0]?.availability;
    const lead = v.leadTimeDays ?? p.inventory[0]?.leadTimeDays;
    return avail === "MADE_TO_ORDER" && !(lead && lead > 0);
  });
  if (missingLead.length) throw new AdminError(`Siparişe üretilen ${missingLead.length} ürün için temin süresi (gün) girin.`, { leadTimeDays: "Siparişe üretim için zorunlu" });

  return db.$transaction(async (tx) => {
    let brandId: string | null = null;
    if (v.brand) {
      const existing = await tx.brand.findFirst({ where: { name: { equals: v.brand, mode: "insensitive" } }, select: { id: true, status: true, name: true } });
      const brand = existing
        ? await tx.brand.update({ where: { id: existing.id }, data: { status: "VERIFIED" }, select: { id: true } })
        : await tx.brand.create({ data: { name: v.brand, slug: await uniqueBrandSlug(tx, slugify(v.brand)), status: "VERIFIED" }, select: { id: true } });
      brandId = brand.id;
      await tx.auditLog.create({ data: { actorId: actor.id, action: "merchant.brand_verified", entityType: "Brand", entityId: brand.id, before: existing ? { name: existing.name, status: existing.status } : undefined, after: { name: v.brand, status: "VERIFIED", note: v.note } } });
    }
    const changed: string[] = [];
    for (const p of products) {
      const inv = p.inventory[0] ?? null;
      const before = { availability: inv?.availability ?? null, leadTimeDays: inv?.leadTimeDays ?? null, quantity: inv?.quantity ?? null, brandId: p.brandId, mpn: p.mpn, identifierExists: p.identifierExists };
      const after = { ...before };
      if (v.availability !== undefined || v.leadTimeDays !== undefined || v.quantity !== undefined) {
        const data: { availability?: Availability; leadTimeDays?: number | null; quantity?: number } = {};
        if (v.quantity !== undefined) data.quantity = v.quantity;
        if (v.availability !== undefined) data.availability = v.availability;
        if (v.leadTimeDays !== undefined) data.leadTimeDays = v.leadTimeDays;
        if (inv) await tx.inventory.update({ where: { id: inv.id }, data });
        else await tx.inventory.create({ data: { productId: p.id, variantId: null, ...data } });
        Object.assign(after, data);
      }
      const productData: { brandId?: string; mpn?: string; identifierExists?: boolean | null } = {};
      if (brandId) productData.brandId = after.brandId = brandId;
      if (mpn[p.id]) {
        productData.mpn = after.mpn = mpn[p.id]!;
        if (p.identifierExists === false) productData.identifierExists = after.identifierExists = null;
      } else if (v.identifierNone && !p.gtin && !p.mpn) {
        productData.identifierExists = after.identifierExists = false;
      }
      if (Object.keys(productData).length) await tx.product.update({ where: { id: p.id }, data: productData });
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        changed.push(p.id);
        await tx.auditLog.create({ data: { actorId: actor.id, action: "merchant.data_reviewed", entityType: "Product", entityId: p.id, before, after: { ...after, note: v.note } } });
      }
    }
    return { changed: changed.length, selected: products.length, brandVerified: !!brandId, mpnSet: Object.keys(mpn).length };
  });
}

async function uniqueBrandSlug(tx: Pick<PrismaClient, "brand">, base: string) {
  for (let i = 0; ; i++) {
    const slug = i ? `${base}-${i + 1}` : base;
    if (!(await tx.brand.findUnique({ where: { slug }, select: { id: true } }))) return slug;
  }
}
