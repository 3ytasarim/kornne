"use client";

import { useParams } from "next/navigation";
import { Compass } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { BOUNDARY_STRINGS } from "@/lib/i18n/boundary-strings";
import { DEFAULT_LOCALE, isEnabledLocale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/routes";

/**
 * Locale-aware 404. Client component reading the [locale] param, so it does not force every route in the
 * segment into dynamic rendering (headers() would).
 */
export default function NotFound() {
  const param = useParams<{ locale?: string }>()?.locale;
  const locale = isEnabledLocale(param) ? param : DEFAULT_LOCALE;
  const d = BOUNDARY_STRINGS[locale];
  const allSlug = d.allProductsSlug;
  return (
    <div className="container-site flex min-h-[60dvh] flex-col items-center justify-center gap-5 py-20 text-center">
      <span className="inline-flex size-16 items-center justify-center rounded-full bg-brand-50 text-brand-700 dark:text-brand-300">
        <Compass aria-hidden="true" className="size-8" />
      </span>
      <p className="font-display text-6xl font-bold text-brand-700 dark:text-brand-300">404</p>
      <h1 className="font-display text-h1 font-bold text-ink">{d.notFound.title}</h1>
      <p className="max-w-md text-steel">{d.notFound.lead}</p>
      <div className="flex flex-wrap justify-center gap-3">
        <ButtonLink href={localizePath(locale, "/")}>{d.notFound.home}</ButtonLink>
        {allSlug ? (
          <ButtonLink href={localizePath(locale, `/kategori/${allSlug}`)} variant="outline">
            {d.notFound.products}
          </ButtonLink>
        ) : null}
      </div>
    </div>
  );
}
