import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "whatsapp" | "danger" | "light";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap transition-[background-color,color,border-color,box-shadow,transform] duration-200 ease-[var(--ease-premium)] select-none disabled:pointer-events-none disabled:opacity-50 active:translate-y-px";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-brand-700 text-white hover:bg-brand-800 shadow-[0_1px_0_rgb(255_255_255/0.08)_inset]",
  secondary: "bg-surface-2 text-ink hover:bg-surface-3 border border-line",
  outline: "border border-line-strong text-ink hover:border-brand-700 hover:text-brand-700 bg-transparent",
  ghost: "text-ink hover:bg-surface-2",
  whatsapp: "bg-whatsapp text-white hover:brightness-95 [text-shadow:0_1px_0_rgb(0_0_0/0.15)]",
  danger: "bg-signal text-white hover:brightness-95",
  /** on dark/brand surfaces */
  light: "bg-white text-brand-900 hover:bg-silver",
};

// 48px minimum tap target on md/lg (WCAG 2.5.5 AAA-friendly, project rule)
const sizes: Record<ButtonSize, string> = {
  sm: "min-h-10 px-3.5 text-sm",
  md: "min-h-12 px-5 text-[0.9375rem]",
  lg: "min-h-14 px-7 text-base",
};

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

type CommonProps = { variant?: ButtonVariant; size?: ButtonSize; icon?: ReactNode; iconEnd?: ReactNode };

export function Button({ variant, size, icon, iconEnd, className, children, type = "button", ...rest }: CommonProps & ComponentProps<"button">) {
  return (
    <button type={type} className={buttonClass(variant, size, className)} {...rest}>
      {icon}
      {children}
      {iconEnd}
    </button>
  );
}

export function ButtonLink({ variant, size, icon, iconEnd, className, children, ...rest }: CommonProps & ComponentProps<typeof Link>) {
  return (
    <Link className={buttonClass(variant, size, className)} {...rest}>
      {icon}
      {children}
      {iconEnd}
    </Link>
  );
}

/** External link styled as a button (WhatsApp, tel:, mailto:). Opens new tab only for http(s). */
export function ButtonAnchor({ variant, size, icon, iconEnd, className, children, href, ...rest }: CommonProps & ComponentProps<"a"> & { href: string }) {
  const external = /^https?:/.test(href);
  return (
    <a href={href} className={buttonClass(variant, size, className)} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})} {...rest}>
      {icon}
      {children}
      {iconEnd}
    </a>
  );
}
