import type { BrowserContext, Page } from "@playwright/test";
import { privateKeyToAccount } from "viem/accounts";
import { state as e2eState } from "./app";

/*
  An injected EIP-1193 test wallet, announced over EIP-6963 as "Test Wallet" (payment plan
  P7). The page can be steered like a user would steer their wallet: switch account,
  switch network, reject the next request.

  Local runs forward signing and sending to the Hardhat node, which holds the accounts
  unlocked — transactions and EIP-712 signatures are real. Remote runs (a deployed site)
  sign with this run's throwaway key right here in the test process; sending
  transactions isn't supported there (demo mode only signs).
*/

const RPC = process.env.CHAIN_RPC_URL ?? "http://127.0.0.1:8545";

/** EIP-712 JSON from the page (uint256 as strings, EIP712Domain listed) → viem's shape. */
function typedDataFromJson(json: string) {
  const td = JSON.parse(json) as { domain: Record<string, unknown>; types: Record<string, { name: string; type: string }[]>; primaryType: string; message: Record<string, unknown> };
  const types = Object.fromEntries(Object.entries(td.types).filter(([k]) => k !== "EIP712Domain"));
  const message = { ...td.message };
  for (const f of types[td.primaryType] ?? []) {
    if (/^u?int\d*$/.test(f.type) && message[f.name] != null) message[f.name] = BigInt(message[f.name] as string);
  }
  const domain = { ...td.domain, ...(td.domain.chainId != null ? { chainId: Number(td.domain.chainId) } : {}) };
  return { domain, types, primaryType: td.primaryType, message };
}

export async function installTestWallet(context: BrowserContext) {
  const st = e2eState();
  const signer = st.wallet.privateKey ? privateKeyToAccount(st.wallet.privateKey as `0x${string}`) : null;

  await context.exposeBinding("__testWalletRpc", async (_src, method: string, params: unknown[]) => {
    if (signer) {
      if (method === "eth_signTypedData_v4") return signer.signTypedData(typedDataFromJson(params[1] as string) as never);
      if (method === "personal_sign") return signer.signMessage({ message: { raw: params[0] as `0x${string}` } });
      throw Object.assign(new Error(`${method} isn't supported by the remote test wallet`), { code: 4200 });
    }
    const res = await fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }).then((r) => r.json());
    if (res.error) throw new Error(res.error.message);
    return res.result;
  });

  await context.addInitScript(
    ({ account, chainId, targetChainId }) => {
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
              if (id !== targetChainId) throw Object.assign(new Error("Unrecognized chain"), { code: 4902 });
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
              // Reads and signing only while on the chain the site uses.
              if (state.chainId !== targetChainId && method !== "eth_blockNumber") {
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
    { account: st.wallet.account, chainId: st.target.chainId, targetChainId: st.target.chainId },
  );
}

export const wallet = {
  switchAccount: (page: Page, a: string) => page.evaluate((x) => (window as unknown as { __testWallet: { switchAccount(a: string): void } }).__testWallet.switchAccount(x), a),
  switchChain: (page: Page, id: number) => page.evaluate((x) => (window as unknown as { __testWallet: { switchChain(id: number): void } }).__testWallet.switchChain(x), id),
  rejectNext: (page: Page) => page.evaluate(() => (window as unknown as { __testWallet: { rejectNext(): void } }).__testWallet.rejectNext()),
  calls: (page: Page) => page.evaluate(() => (window as unknown as { __testWallet: { calls(): string[] } }).__testWallet.calls()),
};
