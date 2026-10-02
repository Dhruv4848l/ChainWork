import "server-only";
import { defineChain } from "viem";
import { hardhat, polygonAmoy } from "viem/chains";
import phaseEscrowAbiJson from "./phaseEscrow.abi.json";

/*
  Chain config for the escrow integration (Phase 7). Everything here is server-only.
  Local dev points at the Hardhat node; the same code targets Polygon Amoy by
  swapping the env vars. Stablecoin uses 18 decimals; 1 token == ₹1 for the demo.
*/

export const RPC_URL = process.env.CHAIN_RPC_URL ?? "http://127.0.0.1:8545";
export const CHAIN_ID = Number(process.env.CHAIN_ID ?? "31337");
export const MNEMONIC =
  process.env.CHAIN_MNEMONIC ??
  "test test test test test test test test test test test junk";
export const RELAYER_INDEX = Number(process.env.CHAIN_RELAYER_INDEX ?? "0");
export const ESCROW_ADDRESS = (process.env.CHAIN_ESCROW_ADDRESS ?? "") as `0x${string}`;
export const TOKEN_ADDRESS = (process.env.CHAIN_TOKEN_ADDRESS ?? "") as `0x${string}`;
export const TOKEN_DECIMALS = 18;
/** v2 (P6): extra allowlisted escrow assets on this chain (test tokens off mainnet). */
export const USDT_ADDRESS = (process.env.CHAIN_USDT_ADDRESS ?? "") as `0x${string}` | "";
export const USDC_ADDRESS = (process.env.CHAIN_USDC_ADDRESS ?? "") as `0x${string}` | "";

export const chainConfigured = Boolean(ESCROW_ADDRESS && TOKEN_ADDRESS);

/** Hardhat's well-known default phrase. Every key derived from it is public. */
const PUBLIC_TEST_MNEMONIC = "test test test test test test test test test test test junk";

export const LOCAL_CHAIN_ID = 31337;

/** True when the custodial/relayer keys come from the public Hardhat phrase. */
export function usesPublicTestMnemonic(mnemonic: string = MNEMONIC): boolean {
  return mnemonic.trim().toLowerCase().split(/\s+/).join(" ") === PUBLIC_TEST_MNEMONIC;
}

export class ChainConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChainConfigError";
  }
}

/**
 * Refuse to SIGN anything on a shared network with public keys. Off the local
 * Hardhat node, anyone can re-derive those keys and sweep every custodial wallet
 * (on Amoy the relayer had already been drained). Reads stay allowed.
 */
export function assertChainWritable(): void {
  if (CHAIN_ID !== LOCAL_CHAIN_ID && usesPublicTestMnemonic()) {
    throw new ChainConfigError(
      `CHAIN_MNEMONIC is the public Hardhat test phrase, but CHAIN_ID=${CHAIN_ID} is a shared network. ` +
        "Generate a private mnemonic, fund its relayer account, grant it ATTESTOR_ROLE + DISPUTE_ROLE " +
        "(contracts/scripts/grant-roles.js), then restart.",
    );
  }
  if (!chainConfigured) {
    throw new ChainConfigError("CHAIN_ESCROW_ADDRESS / CHAIN_TOKEN_ADDRESS are not set.");
  }
}

/** Pick the viem chain object by configured id (local Hardhat or Amoy). */
export function activeChain() {
  if (CHAIN_ID === polygonAmoy.id) return polygonAmoy;
  if (CHAIN_ID === hardhat.id) return hardhat;
  // Fallback: a generic local chain on the configured id.
  return defineChain({
    id: CHAIN_ID,
    name: "ChainWork Local",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
  });
}

export const phaseEscrowAbi = phaseEscrowAbiJson;

/** Minimal ERC-20 ABI (the pieces we call: mint / approve / allowance / balanceOf). */
export const erc20Abi = [
  { type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

/** Block-explorer base URL for tx links (empty on the local chain — no explorer). */
export function explorerTxBase(): string {
  if (CHAIN_ID === 80002) return "https://amoy.polygonscan.com/tx/";
  return ""; // local Hardhat has no explorer
}
