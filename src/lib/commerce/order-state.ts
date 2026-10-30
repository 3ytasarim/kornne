/**
 * Order state machine (technical model — nothing here is shown to a real customer while checkout is locked).
 * Only the listed transitions exist, and each is restricted to specific actors. "provider" = a VERIFIED payment
 * webhook; customers can never mark an order paid.
 */
export type OrderState = "DRAFT" | "AWAITING_PAYMENT" | "PAID" | "FAILED" | "CANCELLED" | "PROCESSING" | "SHIPPED" | "DELIVERED" | "REFUNDED";
export type Actor = "customer" | "provider" | "admin" | "system";

const T: Record<string, Actor[]> = {
  "DRAFT>AWAITING_PAYMENT": ["customer", "system"],
  "DRAFT>CANCELLED": ["customer", "admin", "system"],
  // admin = manual confirmation of an EFT/Havale transfer after checking the bank account (Sprint 12)
  "AWAITING_PAYMENT>PAID": ["provider", "admin"],
  "AWAITING_PAYMENT>FAILED": ["provider", "system"],
  "AWAITING_PAYMENT>CANCELLED": ["customer", "admin", "system"],
  "FAILED>AWAITING_PAYMENT": ["customer"],
  "FAILED>CANCELLED": ["customer", "admin", "system"],
  "PAID>PROCESSING": ["admin"],
  "PAID>REFUNDED": ["admin"],
  "PAID>CANCELLED": ["admin"],
  "PROCESSING>CANCELLED": ["admin"],
  "PROCESSING>SHIPPED": ["admin"],
  "SHIPPED>DELIVERED": ["admin", "system"],
};

export class TransitionError extends Error {
  constructor(
    public from: OrderState,
    public to: OrderState,
    public actor: Actor,
  ) {
    super(`transition ${from} → ${to} not allowed for ${actor}`);
  }
}

export function canTransition(from: OrderState, to: OrderState, actor: Actor): boolean {
  return T[`${from}>${to}`]?.includes(actor) ?? false;
}

export function assertTransition(from: OrderState, to: OrderState, actor: Actor): void {
  if (!canTransition(from, to, actor)) throw new TransitionError(from, to, actor);
}

export const TERMINAL_STATES: OrderState[] = ["CANCELLED", "REFUNDED", "DELIVERED"];
