import { expect, test } from "@playwright/test";
import { downloadReceipt, login, openCheckout, payWithWallet, state } from "./support/app";
import { installTestWallet, wallet } from "./support/wallet";

/*
  The payment window in testnet mode (P7): real transactions from the test wallet and
  server verification. (Receipts + who may download them: receipts.spec.ts.)
*/
test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ context }) => installTestWallet(context));

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
