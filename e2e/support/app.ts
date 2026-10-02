import fs from "node:fs";
import { expect, type Page } from "@playwright/test";

/** The fixture accounts + hires made by global setup for this run. */
export interface E2EState {
  worker: { email: string; name: string };
  testnet: { client: { email: string }; stranger: { email: string }; hires: { wallet: string; pay: string; cancel: string; chainwork: string } };
  demo: { client: { email: string }; hires: { pay: string; expire: string } };
}
export const state = (): E2EState => JSON.parse(fs.readFileSync("e2e/.state.json", "utf8"));

export const PASSWORD = "password123";

export async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByPlaceholder("Phone or email").fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await Promise.all([page.waitForURL(/\/dashboard\//), page.locator('input[type="password"]').press("Enter")]);
}

/** Wait until React has hydrated the page (client handlers attached). */
export async function hydrated(page: Page) {
  await page.waitForFunction(() => {
    const el = document.querySelector("main button, main a, h1");
    return !!el && Object.keys(el).some((k) => k.startsWith("__reactFiber"));
  });
}

/** Open the payment window for the (only) phase of a hire. */
export async function openCheckout(page: Page, hireId: string) {
  await page.goto(`/dashboard/client/hires/${hireId}`);
  await hydrated(page);
  await page.getByRole("button", { name: /^Fund Phase/ }).click();
  const dialog = page.getByRole("dialog", { name: "Fund this phase" });
  await expect(dialog.getByText("Amount due")).toBeVisible();
  return dialog;
}

/** The receipt link in the payment window's result, downloaded with this session. */
export async function downloadReceipt(page: Page, dialog: ReturnType<Page["getByRole"]>) {
  const href = await dialog.getByRole("link", { name: /Download receipt/ }).getAttribute("href");
  expect(href).toMatch(/^\/api\/receipts\/CW-(RCPT|FAIL)-\d{4}-\d+\/pdf$/);
  const res = await page.request.get(href!);
  return { href: href!, res };
}

/** Choose a currency card in the payment window and connect the test wallet if asked. */
export async function payWithWallet(dialog: ReturnType<Page["getByRole"]>, currency: RegExp) {
  await dialog.getByRole("button", { name: currency }).click();
  const own = dialog.getByRole("radio", { name: "My own wallet" });
  if (await own.isVisible()) await own.click();
  await connectTestWallet(dialog);
}

/** Pick "Test Wallet" in the window's wallet picker, unless it's already connected. */
export async function connectTestWallet(dialog: ReturnType<Page["getByRole"]>) {
  const picker = dialog.getByRole("button", { name: /Test Wallet/ });
  if (await picker.isVisible().catch(() => false)) await picker.click();
  await expect(dialog.getByText(/Paying from/)).toBeVisible();
}
