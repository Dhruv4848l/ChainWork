import { expect, test } from "@playwright/test";
import { downloadReceipt, login, openCheckout, payWithWallet, state } from "./support/app";
import { installTestWallet, wallet } from "./support/wallet";

/*
  The payment window in testnet mode (P7): real transactions from the test wallet, server
  verification, receipts — and who may download them.
*/
test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ context }) => installTestWallet(context));

let receiptHref = "";

test("pays a phase in USDT from the wallet: approve → fund → verified → receipt", async ({ page }) => {
  const s = state();
  await login(page, s.testnet.client.email);
  const dialog = await openCheckout(page, s.testnet.hires.pay);
  await payWithWallet(dialog, /Tether/);

  await dialog.getByRole("button", { name: "Get the price in USDT" }).click();
  await expect(dialog.getByText(/Price held for/)).toBeVisible();
  await expect(dialog.getByText(/per USDT/)).toBeVisible();
  await dialog.getByRole("button", { name: /^Pay [\d.,]+ USDT$/ }).click();

  await expect(dialog.getByText("Escrow funded")).toBeVisible({ timeout: 120_000 });
  const sends = (await wallet.calls(page)).filter((m) => m === "eth_sendTransaction");
  expect(sends.length, "approve + fundPhaseWith").toBe(2);

  const { href, res } = await downloadReceipt(page, dialog);
  expect(href).toMatch(/CW-RCPT-/);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("application/pdf");
  expect((await res.body()).subarray(0, 4).toString()).toBe("%PDF");
  receiptHref = href;

  // Under the window, the phase is now funded.
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("button", { name: /^Fund Phase/ })).toHaveCount(0);
});

test("a request cancelled in the wallet pays nothing and can be retried", async ({ page }) => {
  const s = state();
  await login(page, s.testnet.client.email);
  const dialog = await openCheckout(page, s.testnet.hires.cancel);
  await payWithWallet(dialog, /Tether/);
  await dialog.getByRole("button", { name: "Get the price in USDT" }).click();
  await expect(dialog.getByText(/Price held for/)).toBeVisible();

  await wallet.rejectNext(page);
  await dialog.getByRole("button", { name: /^Pay [\d.,]+ USDT$/ }).click();
  await expect(dialog.getByText("You cancelled in your wallet. Nothing was paid.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: /^Pay [\d.,]+ USDT$/ })).toBeEnabled();
});

test("pays from the ChainWork wallet after topping up inside the window", async ({ page }) => {
  const s = state();
  await login(page, s.testnet.client.email);
  const dialog = await openCheckout(page, s.testnet.hires.chainwork);
  const pay = dialog.getByRole("button", { name: /from ChainWork wallet$/ });
  await expect(pay).toBeDisabled();
  await dialog.getByRole("button", { name: "Add funds" }).click();
  await expect(pay).toBeEnabled({ timeout: 60_000 });
  await pay.click();
  await expect(dialog.getByText("Escrow funded")).toBeVisible({ timeout: 120_000 });
  const { res } = await downloadReceipt(page, dialog);
  expect(res.status()).toBe(200);
});

test.describe("receipt access", () => {
  test("the payee can download it", async ({ page }) => {
    test.skip(!receiptHref, "needs the USDT payment above");
    await login(page, state().worker.email);
    expect((await page.request.get(receiptHref)).status()).toBe(200);
  });

  test("another client gets 404, not the receipt", async ({ page }) => {
    test.skip(!receiptHref, "needs the USDT payment above");
    await login(page, state().testnet.stranger.email);
    const res = await page.request.get(receiptHref);
    expect(res.status()).toBe(404);
    expect(res.headers()["content-type"]).not.toBe("application/pdf");
  });

  test("a signed-out visitor gets 404", async ({ playwright, baseURL }) => {
    test.skip(!receiptHref, "needs the USDT payment above");
    const anon = await playwright.request.newContext({ baseURL });
    expect((await anon.get(receiptHref)).status()).toBe(404);
    await anon.dispose();
  });
});
