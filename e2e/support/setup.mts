/*
  E2E fixtures (payment plan P7): fresh accounts + signed hires for one run, written to
  e2e/.state.json. Run by e2e/global-setup.ts through `npm run script`, because the
  fixtures use server-only modules.
*/
import fs from "node:fs";
import { createPublicClient, createWalletClient, erc20Abi, http } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";
import { platformDb as db } from "@/lib/platformDb";
import { CHAIN_ID, ESCROW_ADDRESS, USDT_ADDRESS } from "@/lib/chain/config";
import { makeSignedHire, makeUser } from "../../tests/fixtures";
import { PAYER } from "./accounts";

if (CHAIN_ID !== 31337) throw new Error("E2E fixtures only run against the local Hardhat chain (31337).");
const RPC = process.env.CHAIN_RPC_URL ?? "http://127.0.0.1:8545";
const pub = createPublicClient({ chain: hardhat, transport: http(RPC) });
const payer = createWalletClient({ account: PAYER, chain: hardhat, transport: http(RPC) });
const tx = async (h: Promise<`0x${string}`>) => pub.waitForTransactionReceipt({ hash: await h });

// The test wallet holds USDT, with NO allowance — so the window's approve step runs too.
const mintAbi = [{ type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] }] as const;
await tx(payer.writeContract({ address: USDT_ADDRESS as `0x${string}`, abi: mintAbi, functionName: "mint", args: [PAYER, 100_000_000_000n] }));
await tx(payer.writeContract({ address: USDT_ADDRESS as `0x${string}`, abi: erc20Abi, functionName: "approve", args: [ESCROW_ADDRESS, 0n] }));

const worker = await makeUser("WORKER", { externalAddress: privateKeyToAccount(generatePrivateKey()).address });
const client = await makeUser("CLIENT");
const stranger = await makeUser("CLIENT");
const demoClient = await makeUser("CLIENT");
await db.wallet.update({ where: { userId: demoClient.id }, data: { demoCredit: 40_000 } });

const hire = async (c: { id: string }) => (await makeSignedHire(c.id, worker.id)).hireId;
const state = {
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
process.exit(0);
