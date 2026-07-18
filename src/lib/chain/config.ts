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

export const chainConfigured = Boolean(ESCROW_ADDRESS && TOKEN_ADDRESS);

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
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;
