import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { approvePrice, proposePrice, rejectPrice, revokePrice } from "@/lib/admin/prices";
import { bulkProducts, createProduct, saveProductMeta, saveProductTranslation, saveSpec, saveVariants, verifySpec } from "@/lib/admin/products";
import { addQuoteNote, assignQuote, changeQuoteStatus } from "@/lib/admin/quotes";
import { uploadImage } from "@/lib/admin/media";
import { acceptInvite, changeRole, findOpenInvite, inviteUser, setUserActive } from "@/lib/admin/users";
import { createPage, publishPage, restoreRevision, saveBanner, saveFaq, savePageDraft, unpublishPage } from "@/lib/cms/service";
import { createQuoteRequest } from "@/lib/quote/service";
import { cleanupTestSchema, hasTestDb, makeProduct, makeUser, testDb } from "./test-schema";

const proposal = (productId: string, over: Record<string, unknown> = {}) => ({ productId, amount: "250.000,00", currency: "TRY", vatMode: "included", vatRate: "20", evidence: "Test fiyat listesi (fixture)", ...over });

describe.skipIf(!hasTestDb)("Sprint 6/7 services (isolated test schema)", () => {
  const db = testDb();
  beforeAll(async () => cleanupTestSchema(db));
  afterAll(async () => {
    await cleanupTestSchema(db);
    await db.$disconnect();
  });

  describe("price center", () => {
    it("four-eyes approval, supersede, revoke, reject — legacy rows never approvable, history kept", async () => {
      const editor = await makeUser(db, "PRODUCT_EDITOR");
      const admin = await makeUser(db, "ADMIN");
      const p = await makeProduct(db, { priceStatus: "UNVERIFIED" });
      const legacy = await db.price.findFirstOrThrow({ where: { productId: p.product.id } });
      await db.price.update({ where: { id: legacy.id }, data: { source: "LEGACY_IMPORT" } });
      await expect(approvePrice(db, admin, legacy.id)).rejects.toThrow(/doğrudan onaylanamaz/);

      const a = await proposePrice(db, editor, proposal(p.product.id));
      expect(a.status).toBe("UNVERIFIED");
      await expect(approvePrice(db, editor, a.id)).rejects.toThrow(/dört göz/);
      // concurrent double approval → exactly one wins
      const both = await Promise.allSettled([approvePrice(db, admin, a.id), approvePrice(db, admin, a.id)]);
      expect(both.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect((await db.price.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("VERIFIED");

      const b = await proposePrice(db, editor, proposal(p.product.id, { amount: "260.000,00" }));
      await approvePrice(db, admin, b.id);
      const aAfter = await db.price.findUniqueOrThrow({ where: { id: a.id }, include: { events: true } });
      expect(aAfter.validTo).not.toBeNull(); // superseded, not deleted
      expect(aAfter.events.map((e) => e.action)).toEqual(expect.arrayContaining(["proposed", "approved", "superseded"]));

      await expect(revokePrice(db, admin, b.id, "")).rejects.toThrow(/gerekçe/);
      await revokePrice(db, admin, b.id, "müşteri fiyatı geri çekti");
      expect((await db.price.findUniqueOrThrow({ where: { id: b.id } })).status).toBe("REJECTED");

      const c = await proposePrice(db, editor, proposal(p.product.id));
      await expect(rejectPrice(db, { id: (await makeUser(db, "PRODUCT_EDITOR")).id, canApprove: false }, c.id, "başkasının")).rejects.toThrow(/onay yetkilisi/);
      await rejectPrice(db, { id: editor.id, canApprove: false }, c.id, "yanlış girdim");
      expect((await db.price.findUniqueOrThrow({ where: { id: c.id }, include: { events: true } })).events.at(-1)?.action).toBe("withdrawn");
      expect(await db.price.count({ where: { productId: p.product.id } })).toBe(4); // nothing deleted
    });
  });

  describe("quote CRM", () => {
    async function quote() {
      const p = await makeProduct(db);
      const r = await createQuoteRequest(db, { locale: "tr", name: "CRM Test", email: `crm-${randomUUID().slice(0, 6)}@kornne.test`, items: [{ productRef: p.ref, quantity: 2 }], idempotencyKey: randomUUID(), startedAt: Date.now() - 5000 }, { ipHash: `crm-${randomUUID()}` });
      if (!r.ok) throw new Error("quote fixture failed");
      return db.quoteRequest.findUniqueOrThrow({ where: { reference: r.reference } });
    }
    it("records a BLOCKED outbox notification with the quote (no provider → never 'sent')", async () => {
      const q = await quote();
      const o = await db.notificationOutbox.findFirstOrThrow({ where: { entityId: q.id } });
      expect(o.status).toBe("BLOCKED");
      expect(JSON.stringify(o.payload)).not.toContain("@");
      expect(o.recipient).toBeNull();
    });
    it("valid transitions only, optimistic versions, required notes/outcomes, one winner under concurrency", async () => {
      const op = await makeUser(db, "ORDER_OPERATOR");
      const q = await quote();
      await expect(changeQuoteStatus(db, op, { id: q.id, version: 0, to: "RESPONDED", note: "e-posta ile" })).rejects.toThrow(/geçilemez/);
      const v1 = await changeQuoteStatus(db, op, { id: q.id, version: 0, to: "IN_REVIEW" });
      await expect(changeQuoteStatus(db, op, { id: q.id, version: 0, to: "QUOTE_PREPARED" })).rejects.toThrow(/başka biri/);
      const race = await Promise.allSettled([changeQuoteStatus(db, op, { id: q.id, version: v1, to: "QUOTE_PREPARED" }), changeQuoteStatus(db, op, { id: q.id, version: v1, to: "SPAM" })]);
      expect(race.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const now = await db.quoteRequest.findUniqueOrThrow({ where: { id: q.id } });
      if (now.status === "QUOTE_PREPARED") {
        await expect(changeQuoteStatus(db, op, { id: q.id, version: now.version, to: "RESPONDED" })).rejects.toThrow();
        const v = await changeQuoteStatus(db, op, { id: q.id, version: now.version, to: "RESPONDED", note: "e-posta ile gönderildi 22.10" });
        await expect(changeQuoteStatus(db, op, { id: q.id, version: v, to: "CLOSED" })).rejects.toThrow();
        await changeQuoteStatus(db, op, { id: q.id, version: v, to: "CLOSED", outcome: "won" });
      }
      const events = await db.quoteStatusEvent.findMany({ where: { quoteRequestId: q.id }, orderBy: { createdAt: "asc" } });
      expect(events[0]?.toStatus).toBe("NEW");
      expect(events.every((e, i) => i === 0 || e.actorId === op.id)).toBe(true);
      // the original reference and item snapshot are untouched
      const after = await db.quoteRequest.findUniqueOrThrow({ where: { id: q.id }, include: { items: true } });
      expect(after.reference).toBe(q.reference);
      expect(after.items[0]?.quantity).toBe(2);
    });
    it("assignment only to quote-capable active users; notes are stored as plain text and audited without content", async () => {
      const op = await makeUser(db, "ORDER_OPERATOR");
      const seo = await makeUser(db, "SEO_EDITOR");
      const q = await quote();
      await expect(assignQuote(db, op, { id: q.id, version: 0, assigneeId: seo.id })).rejects.toThrow(/yetkisine/);
      await assignQuote(db, op, { id: q.id, version: 0, assigneeId: op.id });
      const n = await addQuoteNote(db, op, { id: q.id, body: "<img src=x onerror=alert(1)> müşteriyi ara" });
      expect(n.body).toContain("<img"); // stored verbatim as text, rendered escaped
      const audit = await db.auditLog.findFirstOrThrow({ where: { action: "quote.note_added", entityId: q.id } });
      expect(JSON.stringify(audit.after)).not.toContain("müşteriyi");
    });
  });

  describe("products", () => {
    it("slug change keeps old URLs one hop away and refuses a path that is a redirect source", async () => {
      const editor = await makeUser(db, "PRODUCT_EDITOR");
      const p = await makeProduct(db);
      const oldSlug = `test-urun-${p.ref}`;
      await db.redirect.create({ data: { fromPath: `/urun/legacy-${p.ref}`, toPath: `/urun/${oldSlug}`, source: "LEGACY_AUDIT" } });
      await db.redirect.create({ data: { fromPath: `/urun/taken-${p.ref}`, toPath: "/", source: "LEGACY_AUDIT" } });
      const t0 = await db.product.findUniqueOrThrow({ where: { id: p.product.id } });
      await expect(saveProductTranslation(db, editor, { id: p.product.id, expectedUpdatedAt: t0.updatedAt.toISOString(), locale: "tr", title: "Yeni ad", slug: `taken-${p.ref}` })).rejects.toThrow(/yönlendirme/);
      const r = await saveProductTranslation(db, editor, { id: p.product.id, expectedUpdatedAt: t0.updatedAt.toISOString(), locale: "tr", title: "TEST ürün yeni", slug: `test-urun-yeni-${p.ref}`, descriptionHtml: "<p>ok</p><script>alert(1)</script>" });
      expect(r.moved?.newPath).toBe(`/urun/test-urun-yeni-${p.ref}`);
      expect((await db.redirect.findUniqueOrThrow({ where: { fromPath: `/urun/${oldSlug}` } })).toPath).toBe(`/urun/test-urun-yeni-${p.ref}`);
      expect((await db.redirect.findUniqueOrThrow({ where: { fromPath: `/urun/legacy-${p.ref}` } })).toPath).toBe(`/urun/test-urun-yeni-${p.ref}`); // still single hop
      expect(r.translation.descriptionHtml).not.toContain("script");
      // stale form → refused (optimistic lock)
      await expect(saveProductTranslation(db, editor, { id: p.product.id, expectedUpdatedAt: t0.updatedAt.toISOString(), locale: "tr", title: "x yy", slug: `test-urun-yeni-${p.ref}` })).rejects.toThrow(/başka biri/);
    });
    it("re-saving an unchanged legacy text keeps it verbatim (no false 'edited' status)", async () => {
      const editor = await makeUser(db, "PRODUCT_EDITOR");
      const p = await makeProduct(db);
      await db.productTranslation.update({ where: { productId_locale: { productId: p.product.id, locale: "tr" } }, data: { status: "LEGACY_SOURCE", descriptionHtml: "<p>Döner tablalı <strong>kapak</strong></p>" } });
      const t0 = await db.product.findUniqueOrThrow({ where: { id: p.product.id } });
      const r = await saveProductTranslation(db, editor, { id: p.product.id, expectedUpdatedAt: t0.updatedAt.toISOString(), locale: "tr", title: `TEST ürün ${p.ref}`, slug: `test-urun-${p.ref}`, descriptionHtml: "<p>Döner tablalı <strong>kapak</strong></p>", seoTitle: "E2E SEO başlık" });
      expect(r.translation.status).toBe("LEGACY_SOURCE");
      expect(r.translation.seoTitle).toBe("E2E SEO başlık");
    });
    it("a held product (#208-like) is published only with release permission + reason", async () => {
      const editor = await makeUser(db, "PRODUCT_EDITOR");
      const p = await makeProduct(db, { needsReview: true });
      const fresh = async () => (await db.product.findUniqueOrThrow({ where: { id: p.product.id } })).updatedAt.toISOString();
      const cat = await db.category.create({ data: { key: `test-cat-${p.ref}`, status: "PUBLISHED", translations: { create: { locale: "tr", name: "Test", slug: `test-cat-${p.ref}` } } } });
      await db.productCategory.create({ data: { productId: p.product.id, categoryId: cat.id, isPrimary: true } });
      await expect(saveProductMeta(db, { id: editor.id, canReleaseHold: false }, { id: p.product.id, expectedUpdatedAt: await fresh(), sortOrder: 0, status: "PUBLISHED" })).rejects.toThrow(/inceleme/);
      await expect(saveProductMeta(db, { id: editor.id, canReleaseHold: false }, { id: p.product.id, expectedUpdatedAt: await fresh(), sortOrder: 0, status: "PUBLISHED", releaseHold: "on", releaseReason: "müşteri kararı" })).rejects.toThrow(/yetkiniz/);
      await expect(saveProductMeta(db, { id: editor.id, canReleaseHold: true }, { id: p.product.id, expectedUpdatedAt: await fresh(), sortOrder: 0, status: "PUBLISHED", releaseHold: "on" })).rejects.toThrow(/gerekçe/i);
      const r = await saveProductMeta(db, { id: editor.id, canReleaseHold: true }, { id: p.product.id, expectedUpdatedAt: await fresh(), sortOrder: 0, status: "PUBLISHED", releaseHold: "on", releaseReason: "müşteri 2026-10-22 e-postası" });
      expect(r.product.needsReview).toBe(false);
      expect((await db.auditLog.findFirstOrThrow({ where: { action: "product.hold_released", entityId: p.product.id } })).after).toMatchObject({ releaseReason: "müşteri 2026-10-22 e-postası" });
      await db.productCategory.deleteMany({ where: { categoryId: cat.id } });
      await db.category.delete({ where: { id: cat.id } });
    });
    it("variants are never deleted, specs need a source to be verified, bulk only takes products off the storefront", async () => {
      const editor = await makeUser(db, "PRODUCT_EDITOR");
      const p = await makeProduct(db, { variants: ["6'lı", "8'li"] });
      const [v1, v2] = p.product.variants;
      await saveVariants(db, editor, { productId: p.product.id, variants: [{ id: v1!.id, tr: "6'lı", en: "6-pack", active: false, sortOrder: 0 }] });
      expect(await db.productVariant.count({ where: { productId: p.product.id } })).toBe(2);
      expect((await db.productVariant.findUniqueOrThrow({ where: { id: v1!.id } })).active).toBe(false);
      expect((await db.productVariant.findUniqueOrThrow({ where: { id: v2!.id } })).active).toBe(true);
      const spec = await saveSpec(db, editor, { productId: p.product.id, key: "motor_gucu", label: "Motor gücü", value: "4", unit: "kW" });
      expect(spec.status).toBe("UNVERIFIED");
      await expect(verifySpec(db, editor, { specId: spec.id, source: "" })).rejects.toThrow();
      expect((await verifySpec(db, editor, { specId: spec.id, source: "Teknik föy 2026" })).status).toBe("VERIFIED");
      expect((await saveSpec(db, editor, { productId: p.product.id, specId: spec.id, key: "motor_gucu", label: "Motor gücü", value: "5", unit: "kW" })).status).toBe("UNVERIFIED");
      expect(await bulkProducts(db, editor, { ids: [p.product.id], op: "archive" })).toBe(1);
      expect((await db.product.findUniqueOrThrow({ where: { id: p.product.id } })).status).toBe("ARCHIVED");
      await expect(bulkProducts(db, editor, { ids: [p.product.id], op: "publish" })).rejects.toThrow();
    });
    it("new products start as DRAFT, quote-only, unverified", async () => {
      const editor = await makeUser(db, "PRODUCT_EDITOR");
      const cat = await db.category.create({ data: { key: `test-cat-new-${Date.now()}`, status: "PUBLISHED" } });
      const prod = await createProduct(db, editor, { title: "Test Yeni Ürün", slug: `test-yeni-${Date.now()}`, categoryId: cat.id });
      expect(prod).toMatchObject({ status: "DRAFT", saleMode: "QUOTE_ONLY", verificationStatus: "UNVERIFIED" });
      await db.product.delete({ where: { id: prod.id } });
      await db.category.delete({ where: { id: cat.id } });
    });
  });

  describe("CMS", () => {
    it("draft → review → publish; live content changes only on republish; restore; unpublish; sanitized", async () => {
      const seo = await makeUser(db, "SEO_EDITOR");
      const editorActor = { id: seo.id, canPublish: false };
      const publisher = { id: (await makeUser(db, "ADMIN")).id, canPublish: true };
      const { page } = await createPage(db, editorActor, { kind: "CORPORATE", key: `e2e-it-${Date.now()}`, locale: "tr", title: "Hakkımızda test", slug: `e2e-hakkimizda-${Date.now()}` });
      const slug = (await db.pageTranslation.findFirstOrThrow({ where: { pageId: page.id } })).slug;
      const r1 = await savePageDraft(db, editorActor, { pageId: page.id, locale: "tr", title: "Hakkımızda test", slug, bodyHtml: '<p onclick="x()">Birinci <a href="javascript:alert(1)">metin</a></p><script>alert(1)</script>' });
      expect(r1.revision.bodyHtml).not.toMatch(/script|onclick|javascript:/);
      expect(r1.sanitized).toBe(true);
      await expect(publishPage(db, editorActor, page.id, "tr")).rejects.toThrow(/yetkiniz/);
      await publishPage(db, publisher, page.id, "tr");
      let t = await db.pageTranslation.findFirstOrThrow({ where: { pageId: page.id }, include: { publishedRevision: true } });
      expect(t.state).toBe("PUBLISHED");
      expect(t.publishedRevision?.bodyHtml).toContain("Birinci");
      await savePageDraft(db, editorActor, { pageId: page.id, locale: "tr", title: "Hakkımızda test", slug, bodyHtml: "<p>İkinci</p>" });
      t = await db.pageTranslation.findFirstOrThrow({ where: { pageId: page.id }, include: { publishedRevision: true } });
      expect(t.publishedRevision?.bodyHtml).toContain("Birinci"); // live unchanged until republished
      await publishPage(db, publisher, page.id, "tr");
      t = await db.pageTranslation.findFirstOrThrow({ where: { pageId: page.id }, include: { publishedRevision: true } });
      expect(t.publishedRevision?.bodyHtml).toContain("İkinci");
      await restoreRevision(db, editorActor, r1.revision.id);
      expect((await db.pageTranslation.findFirstOrThrow({ where: { pageId: page.id } })).bodyHtml).toContain("Birinci");
      await unpublishPage(db, publisher, page.id, "tr");
      const afterUnpublish = await db.pageTranslation.findFirstOrThrow({ where: { pageId: page.id } });
      expect(afterUnpublish).toMatchObject({ state: "DRAFT", publishedRevisionId: null, publishedSlug: null });
      expect(await db.pageRevision.count({ where: { pageTranslationId: afterUnpublish.id } })).toBeGreaterThanOrEqual(4);
    });
    it("republishing under a new slug keeps the old public URL working (301)", async () => {
      const publisher = { id: (await makeUser(db, "ADMIN")).id, canPublish: true };
      const key = `e2e-slug-${Date.now()}`;
      const { page } = await createPage(db, publisher, { kind: "INFO", key, locale: "tr", title: "Bilgi", slug: `${key}-a` });
      await savePageDraft(db, publisher, { pageId: page.id, locale: "tr", title: "Bilgi", slug: `${key}-a`, bodyHtml: "<p>x</p>" });
      await publishPage(db, publisher, page.id, "tr");
      await savePageDraft(db, publisher, { pageId: page.id, locale: "tr", title: "Bilgi", slug: `${key}-b`, bodyHtml: "<p>x</p>" });
      await publishPage(db, publisher, page.id, "tr");
      expect((await db.redirect.findUniqueOrThrow({ where: { fromPath: `/sayfa/${key}-a` } })).toPath).toBe(`/sayfa/${key}-b`);
    });
    it("banners need an end date to go live; FAQ answers need a source; non-publishers land in review", async () => {
      const seo = { id: (await makeUser(db, "SEO_EDITOR")).id, canPublish: false };
      const admin = { id: (await makeUser(db, "ADMIN")).id, canPublish: true };
      const tr = [{ locale: "tr" as const, title: "E2E duyuru" }];
      await expect(saveBanner(db, admin, { placement: "HOME_STRIP", state: "PUBLISHED", translations: tr })).rejects.toThrow(/bitiş/i);
      await expect(saveBanner(db, admin, { placement: "HOME_STRIP", state: "DRAFT", linkPath: "javascript:alert(1)", translations: tr })).rejects.toThrow();
      const b = await saveBanner(db, seo, { placement: "HOME_STRIP", state: "PUBLISHED", endsAt: new Date(Date.now() + 86_400_000).toISOString(), translations: tr });
      expect(b.state).toBe("REVIEW");
      await expect(saveFaq(db, admin, { locale: "tr", question: "E2E soru nedir?", answerHtml: "<p>Cevap</p>", state: "PUBLISHED" })).rejects.toThrow(/kaynağını/);
      expect((await saveFaq(db, admin, { locale: "tr", question: "E2E soru nedir?", answerHtml: "<p>Cevap</p>", state: "PUBLISHED", source: "Firma beyanı 2026-10" })).state).toBe("PUBLISHED");
    });
  });

  describe("users", () => {
    it("one-time invite: strong password, single use, expires; role/active guards", async () => {
      const sa = await makeUser(db, "SUPER_ADMIN");
      const { user, link } = await inviteUser(db, sa, { email: `invitee-${Date.now()}@kornne.test`, name: "Davetli", role: "SEO_EDITOR" });
      const token = link.split("/").pop()!;
      expect(await findOpenInvite(db, token)).not.toBeNull();
      await expect(acceptInvite(db, { token, password: "kisa", confirm: "kisa" })).rejects.toThrow(/güçlü/);
      await expect(acceptInvite(db, { token, password: "aaaaaaaaaaaaaaaa", confirm: "aaaaaaaaaaaaaaaa" })).rejects.toThrow(/güçlü/);
      const both = await Promise.allSettled([acceptInvite(db, { token, password: "Kornne-Test-2026!x", confirm: "Kornne-Test-2026!x" }), acceptInvite(db, { token, password: "Kornne-Test-2026!x", confirm: "Kornne-Test-2026!x" })]);
      expect(both.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(await findOpenInvite(db, token)).toBeNull();
      expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash).toMatch(/^\$argon2/);
      await expect(changeRole(db, sa, { userId: sa.id, role: "ADMIN" })).rejects.toThrow(/Kendi/);
      await db.session.create({ data: { userId: user.id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 3_600_000) } });
      await changeRole(db, sa, { userId: user.id, role: "PRODUCT_EDITOR" });
      expect(await db.session.count({ where: { userId: user.id } })).toBe(0); // re-authenticate with the new role
      await expect(setUserActive(db, sa, { userId: sa.id, active: false })).rejects.toThrow(/Kendi/);
    });
  });

  describe("media upload", () => {
    let dir = "";
    beforeAll(() => {
      dir = mkdtempSync(join(tmpdir(), "kornne-it-media-"));
      process.env.MEDIA_DIR = dir;
    });
    afterAll(() => {
      delete process.env.MEDIA_DIR;
      rmSync(dir, { recursive: true, force: true });
    });
    it("stores a real image once (dedupe by SHA-256) and refuses disguised / script files", async () => {
      const u = await makeUser(db, "PRODUCT_EDITOR");
      const png = await sharp({ create: { width: 600, height: 600, channels: 3, background: "#293E59" } }).png().toBuffer();
      const a = await uploadImage(db, u, new File([new Uint8Array(png)], "../../Döş Açma.png", { type: "image/png" }), "Lacivert test görseli");
      expect(a.duplicate).toBe(false);
      expect(a.asset.publicPath).toMatch(/^\/upload\/kornne-dos-acma-[a-f0-9]{10}\.png$/);
      expect(readdirSync(dir)).toHaveLength(1);
      const b = await uploadImage(db, u, new File([new Uint8Array(png)], "kopya.png", { type: "image/png" }), "Aynı görsel");
      expect(b.duplicate).toBe(true);
      expect(readdirSync(dir)).toHaveLength(1);
      await expect(uploadImage(db, u, new File(["<?php system($_GET['c']); ?>"], "resim.png", { type: "image/png" }), "kötü dosya")).rejects.toThrow(/JPEG, PNG/);
      await expect(uploadImage(db, u, new File(["<svg onload=alert(1) xmlns='http://www.w3.org/2000/svg'/>"], "logo.svg", { type: "image/svg+xml" }), "svg dosya")).rejects.toThrow(/JPEG, PNG/);
      await expect(uploadImage(db, u, new File([new Uint8Array(png)], "x.png"), "a")).rejects.toThrow(/Alt metin/);
    });
  });
});
