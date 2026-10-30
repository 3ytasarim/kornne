import { PageLanguageLinks } from "@/components/layout/PageLanguageLinks";
import { PaymentNoticeView } from "@/components/shop/PaymentNoticeView";
import { SelfServicePage } from "@/components/shop/SelfServicePage";
import { listPublicBankAccounts } from "@/lib/commerce/bank-accounts";
import { prisma } from "@/lib/db";
import { staticAlternates } from "@/lib/i18n/alternates";
import { getI18n } from "@/lib/i18n/server";
import { buildMetadata } from "@/lib/seo/metadata";

/** Legacy path /odeme-bildirimi (kept 1:1). Bank list is live (admin may activate accounts any time) → dynamic. */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/[locale]/odeme-bildirimi">) {
  const { locale, d } = getI18n((await params).locale);
  return buildMetadata({ title: d.shop.notice.title, description: d.shop.notice.lead, path: "/odeme-bildirimi", locale, noindex: true, alternates: false });
}

export default async function PaymentNoticePage({ params }: PageProps<"/[locale]/odeme-bildirimi">) {
  const localeParam = (await params).locale;
  const { d, href } = getI18n(localeParam);
  const banks = prisma ? await listPublicBankAccounts(prisma).catch(() => []) : [];
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <PageLanguageLinks links={staticAlternates("/odeme-bildirimi")} />
      <SelfServicePage localeParam={localeParam} current="notice" title={d.shop.notice.title} lead={d.shop.notice.lead}>
        <PaymentNoticeView s={d.shop} banks={banks.map((b) => ({ id: b.id, name: `${b.bankName} (IBAN …${b.iban.slice(-4)})` }))} statusHref={href("/siparisim-ne-durumda")} today={today} />
      </SelfServicePage>
    </>
  );
}
