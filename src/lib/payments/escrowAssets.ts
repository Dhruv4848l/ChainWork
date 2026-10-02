import "server-only";
import { CHAIN_ID, TOKEN_ADDRESS, USDC_ADDRESS, USDT_ADDRESS } from "@/lib/chain/config";

/*
  What a phase can be paid in on ChainWork's escrow chain (payment plan P6.6a — Polygon /
  Amoy first): the rupee stablecoin, USDT, USDC and the chain's native coin. Each must also
  be allowlisted in PhaseEscrow v2 (contracts/scripts/deploy.js does that for test tokens).
  Only cwINR can be paid from the ChainWork (custodial) wallet — it holds rupees; crypto
  comes from the payer's own wallet.
*/

export type AssetKey = "cwINR" | "USDT" | "USDC" | "NATIVE";

export interface EscrowAsset {
  key: AssetKey;
  symbol: string;
  name: string;
  /** null = the chain's native coin. */
  address: `0x${string}` | null;
  decimals: number;
  /** CoinGecko id for the INR rate; null when `fixedInr` applies. */
  priceId: string | null;
  fixedInr?: number;
  icon: string;
  /** Payable from the ChainWork (custodial) wallet. */
  custodialPayable: boolean;
}

export function escrowAssets(): EscrowAsset[] {
  const isAmoy = CHAIN_ID === 80002;
  const out: EscrowAsset[] = [];
  if (TOKEN_ADDRESS) out.push({ key: "cwINR", symbol: "cwINR", name: "ChainWork rupee", address: TOKEN_ADDRESS, decimals: 18, priceId: null, fixedInr: 1, icon: "/tokens/cwinr.svg", custodialPayable: true });
  if (USDT_ADDRESS) out.push({ key: "USDT", symbol: "USDT", name: "Tether USD (test)", address: USDT_ADDRESS, decimals: 6, priceId: "tether", icon: "/tokens/usdt.svg", custodialPayable: false });
  if (USDC_ADDRESS) out.push({ key: "USDC", symbol: "USDC", name: "USD Coin (test)", address: USDC_ADDRESS, decimals: 6, priceId: "usd-coin", icon: "/tokens/usdc.svg", custodialPayable: false });
  out.push(
    isAmoy
      ? { key: "NATIVE", symbol: "POL", name: "Polygon (test POL)", address: null, decimals: 18, priceId: "polygon-ecosystem-token", icon: "/tokens/pol.svg", custodialPayable: false }
      : { key: "NATIVE", symbol: "ETH", name: "Ether (local test)", address: null, decimals: 18, priceId: "ethereum", icon: "/tokens/eth.svg", custodialPayable: false },
  );
  return out;
}

export function escrowAsset(key: string): EscrowAsset | null {
  return escrowAssets().find((a) => a.key === key) ?? null;
}
