import { expect, test, type Locator } from "@playwright/test";
import { connectTestWallet, downloadReceipt, login, openCheckout, state } from "./support/app";
import { installTestWallet, wallet } from "./support/wallet";
import { runScript } from "./global-setup";

/*
  The payment window in DEMO mode (P7): the wallet signs an EIP-712 authorisation — no
  transaction, no gas — and demo credit moves into escrow. Pays in the first crypto the
  window offers (USDT where configured, otherwise the chain's native coin).
*/
test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ context }, info) => {
  const t = state().target;
  test.skip(info.project.name === "remote" && t.mode !== "demo", `the deployed site runs in ${t.mode} mode, not demo`);
  await installTestWallet(context);
});

/** Choose the first crypto currency card that isn't greyed out; returns its symbol. */
async function chooseCrypto(dialog: Locator): Promise<string> {
  const cards = dialog.locator('section[aria-label="Currency"] button:not([disabled])');
  const count = await cards.count();
  for (let i = 0; i < count; i++) {
    const symbol = ((await cards.nth(i).locator("span span").first().textContent()) ?? "").trim();
    if (symbol && symbol !== "cwINR") {
      await cards.nth(i).click();
      return symbol;
    }
  }
  throw new Error("The payment window offers no crypto option (only cwINR).");
}

async function quoted(dialog: Locator) {
  const symbol = await chooseCrypto(dialog);
  await connectTestWallet(dialog);
  await dialog.getByRole("button", { name: `Get the price in ${symbol}` }).click();
  await expect(dialog.getByText(/Price held for/)).toBeVisible();
  return dialog.getByRole("button", { name: new RegExp(`^Authorise [\\d.,]+ ${symbol}$`) });
}

test("authorises a crypto payment with one signature and gets a receipt", async ({ page }) => {
  const s = state();
  await login(page, s.demo.client.email);
  const dialog = await openCheckout(page, s.demo.hires.pay);
  await expect(dialog.getByText("Demo money")).toBeVisible();
  const authorise = await quoted(dialog);
  await authorise.click();

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
  const authorise = await quoted(dialog);

  runScript("e2e/support/expire-quote.mts", s.demo.hires.expire); // the 5 minutes pass
  await authorise.click();

  await expect(dialog.getByText("The payment didn’t go through.")).toBeVisible();
  await expect(dialog.getByText(/price lock ran out/)).toBeVisible();
  const { href, res } = await downloadReceipt(page, dialog);
  expect(href).toMatch(/CW-FAIL-/);
  expect(res.status()).toBe(200);
  expect((await res.body()).subarray(0, 4).toString()).toBe("%PDF");
});
