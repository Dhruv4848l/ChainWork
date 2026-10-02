/*
  E2E fixtures (payment plan P7): fresh accounts + signed hires for one run, written to
  e2e/.state.json. Run by e2e/global-setup.ts through `npm run script`, because the
  fixtures use server-only modules.

  Two targets:
    local   (default) the two `next start` servers + the local Hardhat chain. The test
            wallet is Hardhat account #18, which also gets test USDT with no allowance.
    remote  E2E_BASE_URL=https://… — a deployed site. Accounts are written straight into
            ITS database (E2E_DATABASE_URL, required), nothing touches a chain, and the
            test wallet is a throwaway key generated for this run.
*/
import fs from "node:fs";
import { createPublicClient, createWalletClient, erc20Abi, http } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";
import { platformDb as db } from "@/lib/platformDb";
import { CHAIN_ID, ESCROW_ADDRESS, USDT_ADDRESS } from "@/lib/chain/config";
import { makeSignedHire, makeUser } from "../../tests/fixtures";
import { LOCAL_CHAIN_ID, OTHER_ACCOUNT, PAYER } from "./accounts";

const REMOTE = process.env.E2E_BASE_URL?.replace(/\/+$/, "") || null;

let target: { remote: boolean; mode: string; chainId: number };
let wallet: { account: string; other: string; privateKey: string | null };

if (REMOTE) {
  if (!process.env.E2E_DATABASE_URL) throw new Error("E2E_BASE_URL needs E2E_DATABASE_URL — the deployed site's platform database.");
  const headers: Record<string, string> = process.env.E2E_VERCEL_BYPASS ? { "x-vercel-protection-bypass": process.env.E2E_VERCEL_BYPASS } : {};
  const res = await fetch(`${REMOTE}/api/health/chain`, { headers });
  if (!res.headers.get("content-type")?.includes("json")) {
    throw new Error(`${REMOTE}/api/health/chain didn't return JSON (HTTP ${res.status}) — is the new code deployed, or is the preview protected? (set E2E_VERCEL_BYPASS)`);
  }
  const health = (await res.json()) as { mode: string; chainId: number };
  target = { remote: true, mode: health.mode, chainId: health.chainId };
  const key = generatePrivateKey();
  wallet = { account: privateKeyToAccount(key).address, other: privateKeyToAccount(generatePrivateKey()).address, privateKey: key };
  console.log(`E2E target ${REMOTE}: mode ${health.mode}, chain ${health.chainId}`);
} else {
  if (CHAIN_ID !== LOCAL_CHAIN_ID) throw new Error("Local E2E fixtures only run against the local Hardhat chain (31337).");
  const RPC = process.env.CHAIN_RPC_URL ?? "http://127.0.0.1:8545";
  const pub = createPublicClient({ chain: hardhat, transport: http(RPC) });
  const payer = createWalletClient({ account: PAYER, chain: hardhat, transport: http(RPC) });
  const tx = async (h: Promise<`0x${string}`>) => pub.waitForTransactionReceipt({ hash: await h });
  // The test wallet holds USDT, with NO allowance — so the window's approve step runs too.
  const mintAbi = [{ type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] }] as const;
  await tx(payer.writeContract({ address: USDT_ADDRESS as `0x${string}`, abi: mintAbi, functionName: "mint", args: [PAYER, 100_000_000_000n] }));
  await tx(payer.writeContract({ address: USDT_ADDRESS as `0x${string}`, abi: erc20Abi, functionName: "approve", args: [ESCROW_ADDRESS, 0n] }));
  target = { remote: false, mode: "local", chainId: LOCAL_CHAIN_ID };
  wallet = { account: PAYER, other: OTHER_ACCOUNT, privateKey: null };
}

const provision = !target.remote;
const worker = await makeUser("WORKER", { externalAddress: privateKeyToAccount(generatePrivateKey()).address, provision });
const client = await makeUser("CLIENT", { provision });
const stranger = await makeUser("CLIENT", { provision });
const demoClient = await makeUser("CLIENT", { provision });
await db.wallet.update({ where: { userId: demoClient.id }, data: { demoCredit: 40_000 } });

const hire = async (c: { id: string }) => (await makeSignedHire(c.id, worker.id)).hireId;
const state = {
  target,
  wallet,
  worker: { email: worker.email, name: worker.name },
  testnet: {
    client: { email: client.email },
    stranger: { email: stranger.email },
    hires: { wallet: await hire(client), pay: await hire(client), cancel: await hire(client), chainwork: await hire(client) },
  },
  demo: {
    client: { email: demoClient.email },
    hires: { pay: await hire(demoClient), expire: await hire(demoClient) },
  },
};
fs.writeFileSync("e2e/.state.json", JSON.stringify(state, null, 2));
console.log("E2E fixtures ready");
await db.$disconnect();
process.exit(0);
