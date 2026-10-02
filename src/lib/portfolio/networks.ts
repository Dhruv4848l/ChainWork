/*
  Networks + tokens the live wallet tracker reads (payment plan P5.1, decision D4): the
  user's real holdings on the supported MAINNETS (display only — payments still follow
  the payment mode) plus testnet balances, each tagged by network. Pure data.

  MetaMask & co. only speak EVM, so Bitcoin / XRP appear as their wrapped / pegged tokens
  where one exists (WBTC, BTCB, Binance-Peg XRP).
*/

export interface TokenDef {
  symbol: string;
  name: string;
  /** null = the network's native coin. */
  address: `0x${string}` | null;
  decimals: number;
  /** CoinGecko id for the INR price; null = no market price (test tokens). */
  priceId: string | null;
  /** Fixed ₹ per unit when there's no market (cwINR is ₹1 by design). */
  fixedInr?: number;
  icon: string;
}

export interface NetworkDef {
  key: string;
  chainId: number;
  name: string;
  /** Short tag shown under the ticker ("Polygon", "Amoy · test"). */
  tag: string;
  testnet: boolean;
  publicRpc: string;
  /** Alchemy subdomain, used when ALCHEMY_API_KEY is set. */
  alchemy?: string;
  tokens: TokenDef[];
}

const icon = (s: string) => `/tokens/${s}.svg`;
const native = (symbol: string, name: string, priceId: string | null): TokenDef => ({ symbol, name, address: null, decimals: 18, priceId, icon: icon(symbol.toLowerCase()) });

export const MAINNETS: NetworkDef[] = [
  {
    key: "ethereum", chainId: 1, name: "Ethereum", tag: "Ethereum", testnet: false,
    publicRpc: "https://ethereum-rpc.publicnode.com", alchemy: "eth-mainnet",
    tokens: [
      native("ETH", "Ether", "ethereum"),
      { symbol: "USDT", name: "Tether USD", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6, priceId: "tether", icon: icon("usdt") },
      { symbol: "USDC", name: "USD Coin", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6, priceId: "usd-coin", icon: icon("usdc") },
      { symbol: "WBTC", name: "Wrapped Bitcoin", address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", decimals: 8, priceId: "wrapped-bitcoin", icon: icon("btc") },
    ],
  },
  {
    key: "polygon", chainId: 137, name: "Polygon", tag: "Polygon", testnet: false,
    publicRpc: "https://polygon-bor-rpc.publicnode.com", alchemy: "polygon-mainnet",
    tokens: [
      native("POL", "Polygon Ecosystem Token", "polygon-ecosystem-token"),
      { symbol: "USDT", name: "Tether USD", address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", decimals: 6, priceId: "tether", icon: icon("usdt") },
      { symbol: "USDC", name: "USD Coin", address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", decimals: 6, priceId: "usd-coin", icon: icon("usdc") },
      { symbol: "WBTC", name: "Wrapped Bitcoin", address: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6", decimals: 8, priceId: "wrapped-bitcoin", icon: icon("btc") },
    ],
  },
  {
    key: "bsc", chainId: 56, name: "BNB Chain", tag: "BNB Chain", testnet: false,
    publicRpc: "https://bsc-rpc.publicnode.com", alchemy: "bnb-mainnet",
    tokens: [
      native("BNB", "BNB", "binancecoin"),
      { symbol: "USDT", name: "Tether USD", address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18, priceId: "tether", icon: icon("usdt") },
      { symbol: "USDC", name: "USD Coin", address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18, priceId: "usd-coin", icon: icon("usdc") },
      { symbol: "BTCB", name: "Bitcoin (BEP-20)", address: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c", decimals: 18, priceId: "bitcoin", icon: icon("btc") },
      { symbol: "XRP", name: "XRP (Binance-Peg)", address: "0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE", decimals: 18, priceId: "ripple", icon: icon("xrp") },
    ],
  },
];

export const TESTNETS: NetworkDef[] = [
  {
    key: "sepolia", chainId: 11155111, name: "Sepolia", tag: "Sepolia · test", testnet: true,
    publicRpc: "https://ethereum-sepolia-rpc.publicnode.com", alchemy: "eth-sepolia",
    tokens: [native("ETH", "Sepolia Ether", null)],
  },
  {
    key: "amoy", chainId: 80002, name: "Polygon Amoy", tag: "Amoy · test", testnet: true,
    publicRpc: "https://polygon-amoy-bor-rpc.publicnode.com", alchemy: "polygon-amoy",
    tokens: [native("POL", "Amoy POL", null)],
  },
];

/** The escrow stablecoin, added to whichever network ChainWork runs on. */
export function cwInrToken(address: `0x${string}`): TokenDef {
  return { symbol: "cwINR", name: "ChainWork INR (test)", address, decimals: 18, priceId: null, fixedInr: 1, icon: icon("cwinr") };
}
