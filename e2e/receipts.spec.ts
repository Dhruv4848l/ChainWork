import { expect, test } from "@playwright/test";
import { downloadReceipt, login, openCheckout, state } from "./support/app";

/*
  Paying from the ChainWork wallet and the receipt that comes out of it — and who may
  download that receipt (P7). Works in every payment mode, so it also runs against a
  deployed site.
*/
test.describe.configure({ mode: "serial" });

let receiptHref = "";

test("pays from the ChainWork wallet after topping up inside the window, and gets a receipt", async ({ page }) => {
  const s = state();
  await login(page, s.testnet.client.email);
  const dialog = await openCheckout(page, s.testnet.hires.chainwork);
  const pay = dialog.getByRole("button", { name: /from ChainWork wallet$/ });
  await expect(pay).toBeVisible();
  if (await pay.isDisabled()) {
    await dialog.getByRole("button", { name: "Add funds" }).click();
    await expect(pay).toBeEnabled({ timeout: 60_000 });
  }
  await pay.click();
  await expect(dialog.getByText("Escrow funded")).toBeVisible({ timeout: 120_000 });

  const { href, res } = await downloadReceipt(page, dialog);
  expect(href).toMatch(/CW-RCPT-/);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("application/pdf");
  expect((await res.body()).subarray(0, 4).toString()).toBe("%PDF");
  receiptHref = href;
});

test.describe("receipt access", () => {
  test("the payee can download it", async ({ page }) => {
    test.skip(!receiptHref, "needs the payment above");
    await login(page, state().worker.email);
    expect((await page.request.get(receiptHref)).status()).toBe(200);
  });

  test("another client gets 404, not the receipt", async ({ page }) => {
    test.skip(!receiptHref, "needs the payment above");
    await login(page, state().testnet.stranger.email);
    const res = await page.request.get(receiptHref);
    expect(res.status()).toBe(404);
    expect(res.headers()["content-type"]).not.toBe("application/pdf");
  });

  test("a signed-out visitor gets 404", async ({ playwright, baseURL }) => {
    test.skip(!receiptHref, "needs the payment above");
    const anon = await playwright.request.newContext({ baseURL, extraHTTPHeaders: bypassHeaders() });
    expect((await anon.get(receiptHref)).status()).toBe(404);
    await anon.dispose();
  });
});

/** A protected Vercel preview needs the automation-bypass header on every request. */
function bypassHeaders(): Record<string, string> {
  return process.env.E2E_VERCEL_BYPASS ? { "x-vercel-protection-bypass": process.env.E2E_VERCEL_BYPASS } : {};
}
