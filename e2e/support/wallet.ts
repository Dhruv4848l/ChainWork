import type { BrowserContext, Page } from "@playwright/test";
import { LOCAL_CHAIN_ID, PAYER } from "./accounts";

/*
  An injected EIP-1193 test wallet, announced over EIP-6963 as "Test Wallet" (payment plan
  P7). Signing and sending are forwarded to the local Hardhat node, which holds the
  accounts unlocked — so transactions and EIP-712 signatures are real. The page can be
  steered like a user would steer their wallet: switch account, switch network, reject
  the next request.
*/

const RPC = process.env.CHAIN_RPC_URL ?? "http://127.0.0.1:8545";

export async function installTestWallet(context: BrowserContext, opts: { account?: string; chainId?: number } = {}) {
  await context.exposeBinding("__testWalletRpc", async (_src, method: string, params: unknown[]) => {
    const res = await fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }).then((r) => r.json());
    if (res.error) throw new Error(res.error.message);
    return res.result;
  });

  await context.addInitScript(
    ({ account, chainId, localChainId }) => {
      const listeners: Record<string, ((v: unknown) => void)[]> = {};
      const emit = (ev: string, v: unknown) => (listeners[ev] ?? []).forEach((f) => f(v));
      // Like a real wallet: no accounts are exposed until the site asks and the user approves.
      const state = { account, chainId, authorized: false, rejectNext: false, calls: [] as string[] };
      const hex = (n: number) => "0x" + n.toString(16);

      const provider = {
        async request({ method, params }: { method: string; params?: unknown[] }) {
          state.calls.push(method);
          if (state.rejectNext && /^(eth_sendTransaction|eth_signTypedData_v4|personal_sign)$/.test(method)) {
            state.rejectNext = false;
            throw Object.assign(new Error("User rejected the request."), { code: 4001 });
          }
          switch (method) {
            case "eth_requestAccounts":
              state.authorized = true;
              return [state.account];
            case "eth_accounts":
              return state.authorized ? [state.account] : [];
            case "eth_chainId":
              return hex(state.chainId);
            case "net_version":
              return String(state.chainId);
            case "wallet_switchEthereumChain": {
              const id = parseInt((params?.[0] as { chainId: string }).chainId, 16);
              if (id !== localChainId) throw Object.assign(new Error("Unrecognized chain"), { code: 4902 });
              state.chainId = id;
              emit("chainChanged", hex(id));
              return null;
            }
            case "wallet_addEthereumChain":
            case "wallet_watchAsset":
              return null;
            case "wallet_requestPermissions":
              state.authorized = true;
              return [{ parentCapability: "eth_accounts" }];
            case "wallet_getPermissions":
              return state.authorized ? [{ parentCapability: "eth_accounts" }] : [];
            default:
              // Reads and signing go to the node — only while on the chain it serves.
              if (state.chainId !== localChainId && method !== "eth_blockNumber") {
                throw Object.assign(new Error("Chain mismatch"), { code: 4901 });
              }
              return (window as unknown as { __testWalletRpc: (m: string, p: unknown[]) => Promise<unknown> }).__testWalletRpc(method, params ?? []);
          }
        },
        on(ev: string, f: (v: unknown) => void) {
          (listeners[ev] ??= []).push(f);
        },
        removeListener(ev: string, f: (v: unknown) => void) {
          listeners[ev] = (listeners[ev] ?? []).filter((g) => g !== f);
        },
      };

      // Steering, as the user would in their wallet UI.
      (window as unknown as Record<string, unknown>).__testWallet = {
        switchAccount(a: string) {
          state.account = a;
          emit("accountsChanged", [a]);
        },
        switchChain(id: number) {
          state.chainId = id;
          emit("chainChanged", hex(id));
        },
        rejectNext() {
          state.rejectNext = true;
        },
        calls: () => [...state.calls],
      };

      const info = {
        uuid: "5b0f0c3e-0000-4000-8000-000000000018",
        name: "Test Wallet",
        rdns: "dev.chainwork.testwallet",
        icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Crect width='32' height='32' rx='6' fill='gray'/%3E%3C/svg%3E",
      };
      const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info, provider }) }));
      window.addEventListener("eip6963:requestProvider", announce);
      announce();
    },
    { account: opts.account ?? PAYER, chainId: opts.chainId ?? LOCAL_CHAIN_ID, localChainId: LOCAL_CHAIN_ID },
  );
}

export const wallet = {
  switchAccount: (page: Page, a: string) => page.evaluate((x) => (window as unknown as { __testWallet: { switchAccount(a: string): void } }).__testWallet.switchAccount(x), a),
  switchChain: (page: Page, id: number) => page.evaluate((x) => (window as unknown as { __testWallet: { switchChain(id: number): void } }).__testWallet.switchChain(x), id),
  rejectNext: (page: Page) => page.evaluate(() => (window as unknown as { __testWallet: { rejectNext(): void } }).__testWallet.rejectNext()),
  calls: (page: Page) => page.evaluate(() => (window as unknown as { __testWallet: { calls(): string[] } }).__testWallet.calls()),
};
