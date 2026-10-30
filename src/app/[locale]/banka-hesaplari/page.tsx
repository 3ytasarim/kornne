import { Info } from "lucide-react";
import { PageLanguageLinks } from "@/components/layout/PageLanguageLinks";
import { BankAccountList } from "@/components/shop/BankAccountList";
import { SelfServicePage } from "@/components/shop/SelfServicePage";
import { listPublicBankAccounts } from "@/lib/commerce/bank-accounts";
import { prisma } from "@/lib/db";
import { staticAlternates } from "@/lib/i18n/alternates";
import { getI18n } from "@/lib/i18n/server";
import { buildMetadata } from "@/lib/seo/metadata";

/**
 * Legacy path /banka-hesaplari. Only ACTIVE accounts with a valid TR IBAN are shown (Admin › Banka hesapları);
 * placeholder numbers are never published. Short ISR so an IBAN change appears within a minute.
 */
export const revalidate = 60;

export async function generateMetadata({ params }: PageProps<"/[locale]/banka-hesaplari">) {
  const { locale, d } = getI18n((await params).locale);
  return buildMetadata({ title: d.shop.banks.title, description: d.shop.banks.lead, path: "/banka-hesaplari", locale, noindex: true, alternates: false });
}

export default async function BankAccountsPage({ params }: PageProps<"/[locale]/banka-hesaplari">) {
  const localeParam = (await params).locale;
  const { d } = getI18n(localeParam);
  const banks = prisma ? await listPublicBankAccounts(prisma).catch(() => []) : [];
  return (
    <>
      <PageLanguageLinks links={staticAlternates("/banka-hesaplari")} />
      <SelfServicePage localeParam={localeParam} current="banks" title={d.shop.banks.title} lead={d.shop.banks.lead}>
        {banks.length ? (
          <div className="space-y-5">
            <p className="flex items-start gap-2 rounded-[var(--radius-md)] border border-warning/30 bg-warning-50 p-4 text-sm text-ink">
              <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
              {d.shop.banks.reminder}
            </p>
            <BankAccountList accounts={banks} labels={d.shop.banks} />
          </div>
        ) : (
          <p className="rounded-[var(--radius-lg)] border border-line bg-surface-2 p-6 text-ink-2">{d.shop.banks.pending}</p>
        )}
      </SelfServicePage>
    </>
  );
}
