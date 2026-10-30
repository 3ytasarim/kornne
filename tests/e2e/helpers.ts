import type { Locator, Page } from "@playwright/test";

/**
 * Two-step ConfirmSubmit. Admin buttons are disabled until hydration, so Playwright's auto-wait (enabled) guarantees
 * the first click arms the control; the armed button is then found by its confirmation label and clicked.
 */
export async function confirmSubmit(page: Page, first: Locator, confirmLabel: string | RegExp = /Emin misiniz/) {
  await first.click();
  await page.getByRole("button", { name: confirmLabel }).click();
}

export async function login(page: Page, email: string, password: string) {
  await page.goto("/admin/login");
  // interact only after hydration (a pre-hydration submit falls back to a native POST)
  await page.waitForLoadState("networkidle");
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Şifre").fill(password);
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await page.waitForURL(/\/admin$/);
}
