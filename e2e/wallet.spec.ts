import { expect, test } from "@playwright/test";
import { connectTestWallet, login, openCheckout, state } from "./support/app";
import { OTHER_ACCOUNT } from "./support/accounts";
import { installTestWallet, wallet } from "./support/wallet";

/* Wallet discovery, and the user changing things in their wallet mid-payment (P7). */

test.beforeEach(async ({ context }) => installTestWallet(context));

async function ownWalletWindow(page: import("@playwright/test").Page) {
  const s = state();
  await login(page, s.testnet.client.email);
  const dialog = await openCheckout(page, s.testnet.hires.wallet);
  await dialog.getByRole("radio", { name: "My own wallet" }).click();
  return dialog;
}

test("lists the wallet the browser announced (EIP-6963) and connects to it", async ({ page }) => {
  const dialog = await ownWalletWindow(page);
  await expect(dialog.getByRole("button", { name: /Test Wallet/ })).toBeVisible();
  await connectTestWallet(dialog);
  await expect(dialog.getByText(/Paying from\s*0xdD2F…44C0/)).toBeVisible();
});

test("blocks paying on the wrong network until the wallet switches back", async ({ page }) => {
  const dialog = await ownWalletWindow(page);
  await connectTestWallet(dialog);

  await wallet.switchChain(page, 1); // the user picks Ethereum mainnet in their wallet
  await expect(dialog.getByText("Your wallet is on another network.")).toBeVisible();
  await dialog.getByRole("button", { name: /^Switch to / }).click();
  await expect(dialog.getByText("Your wallet is on another network.")).toBeHidden();
  expect(await wallet.calls(page)).toContain("wallet_switchEthereumChain");
});

test("follows an account switch in the wallet without a reload", async ({ page }) => {
  const dialog = await ownWalletWindow(page);
  await connectTestWallet(dialog);
  await expect(dialog.getByText(/Paying from\s*0xdD2F…44C0/)).toBeVisible();

  await wallet.switchAccount(page, OTHER_ACCOUNT);
  await expect(dialog.getByText(/Paying from\s*0xbDA5…197E/)).toBeVisible();
});
