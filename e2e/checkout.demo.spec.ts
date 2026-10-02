import { expect, test } from "@playwright/test";
import { downloadReceipt, login, openCheckout, payWithWallet, state } from "./support/app";
import { installTestWallet, wallet } from "./support/wallet";
import { runScript } from "./global-setup";

/*
  The payment window in DEMO mode (P7): the wallet signs an EIP-712 authorisation — no
  transaction, no gas — and demo credit moves into escrow.
*/
test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ context }) => installTestWallet(context));

test("authorises a USDT payment with one signature and gets a receipt", async ({ page }) => {
  const s = state();
  await login(page, s.demo.client.email);
  const dialog = await openCheckout(page, s.demo.hires.pay);
  await expect(dialog.getByText("Demo money")).toBeVisible();
  await payWithWallet(dialog, /Tether/);
  await dialog.getByRole("button", { name: "Get the price in USDT" }).click();
  await expect(dialog.getByText(/Price held for/)).toBeVisible();
  await dialog.getByRole("button", { name: /^Authorise [\d.,]+ USDT$/ }).click();

  await expect(dialog.getByText("Escrow funded")).toBeVisible({ timeout: 60_000 });
  const calls = await wallet.calls(page);
  expect(calls).toContain("eth_signTypedData_v4");
  expect(calls, "demo mode never sends a transaction").not.toContain("eth_sendTransaction");
  const { href, res } = await downloadReceipt(page, dialog);
  expect(href).toMatch(/CW-RCPT-/);
  expect(res.status()).toBe(200);
});

test("authorising after the price lock ran out fails, with a failed-payment receipt", async ({ page }) => {
  const s = state();
  await login(page, s.demo.client.email);
  const dialog = await openCheckout(page, s.demo.hires.expire);
  await payWithWallet(dialog, /Tether/);
  await dialog.getByRole("button", { name: "Get the price in USDT" }).click();
  await expect(dialog.getByText(/Price held for/)).toBeVisible();

  runScript("e2e/support/expire-quote.mts", s.demo.hires.expire); // the 5 minutes pass
  await dialog.getByRole("button", { name: /^Authorise [\d.,]+ USDT$/ }).click();

  await expect(dialog.getByText("The payment didn’t go through.")).toBeVisible();
  await expect(dialog.getByText(/price lock ran out/)).toBeVisible();
  const { href, res } = await downloadReceipt(page, dialog);
  expect(href).toMatch(/CW-FAIL-/);
  expect(res.status()).toBe(200);
  expect((await res.body()).subarray(0, 4).toString()).toBe("%PDF");
});
