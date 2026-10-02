/*
  Demo-mode wallet payments (payment plan P6.4, decision D3). With PAYMENT_MODE=demo no
  real chain is involved, but a MetaMask user still "pays" the way they would for real:
  they sign an EIP-712 PaymentAuthorization in their wallet — a signature only, no gas,
  no funds move — and the server, after verifying it, moves demo credit into escrow.

  Pure: the browser builds exactly this typed data to sign, the server rebuilds it from
  the stored quote to verify. Any change to the quote changes what was signed.
*/

export const DEMO_AUTH_TYPES = {
  PaymentAuthorization: [
    { name: "quoteId", type: "string" },
    { name: "phaseId", type: "string" },
    { name: "asset", type: "string" },
    { name: "assetAmount", type: "uint256" },
    { name: "amountInr", type: "string" },
    { name: "payTo", type: "string" },
    { name: "expiresAt", type: "uint256" },
  ],
} as const;

export interface DemoAuthQuote {
  id: string;
  phaseId: string;
  assetSymbol: string;
  assetAmount: string;
  amountInr: number;
  workerAddress: string;
  expiresAt: string;
}

export function demoAuthTypedData(q: DemoAuthQuote, chainId: number) {
  return {
    domain: { name: "ChainWork", version: "1", chainId },
    types: DEMO_AUTH_TYPES,
    primaryType: "PaymentAuthorization" as const,
    message: {
      quoteId: q.id,
      phaseId: q.phaseId,
      asset: q.assetSymbol,
      assetAmount: BigInt(q.assetAmount),
      amountInr: q.amountInr.toFixed(2),
      payTo: q.workerAddress,
      expiresAt: BigInt(Math.floor(new Date(q.expiresAt).getTime() / 1000)),
    },
  };
}
