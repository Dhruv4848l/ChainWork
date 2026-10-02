/*
  Wallet errors in plain language (payment plan P4.5 / E5). Wallets report problems as
  EIP-1193 / JSON-RPC codes buried in nested error objects; users should read what
  happened and what to do next instead. Pure — tested in walletErrors.test.ts.
*/

interface ErrLike {
  code?: number | string;
  name?: string;
  message?: string;
  shortMessage?: string;
  details?: string;
  cause?: unknown;
}

/** Walk the `cause` chain (viem / wagmi wrap provider errors several levels deep). */
function chain(err: unknown): ErrLike[] {
  const out: ErrLike[] = [];
  let cur: unknown = err;
  for (let i = 0; i < 8 && cur && typeof cur === "object"; i++) {
    out.push(cur as ErrLike);
    cur = (cur as ErrLike).cause;
  }
  return out;
}

export function walletErrorMessage(err: unknown, opts: { networkName?: string } = {}): string {
  const errs = chain(err);
  const codes = errs.map((e) => Number(e.code)).filter((c) => Number.isFinite(c));
  const text = errs.map((e) => `${e.name ?? ""} ${e.shortMessage ?? ""} ${e.message ?? ""} ${e.details ?? ""}`).join(" ").toLowerCase();
  const net = opts.networkName ?? "the right network";

  if (codes.includes(4001) || /user rejected|user denied|rejected the request|request rejected/.test(text)) {
    return "You cancelled the request in your wallet. Nothing was changed.";
  }
  if (codes.includes(-32002) || /already pending|request of type .* already pending/.test(text)) {
    return "Your wallet already has a request waiting. Open the wallet extension and finish or close it, then try again.";
  }
  if (codes.includes(4902) || /unrecognized chain|chain .* not (been )?added|unknown chain/.test(text)) {
    return `Your wallet doesn't know ${net} yet. Approve adding it when your wallet asks, then try again.`;
  }
  if (codes.includes(4100) || /unauthorized|not been authorized/.test(text)) {
    return "This site isn't connected to that wallet account. Reconnect and approve the connection.";
  }
  if (codes.includes(4900) || codes.includes(4901) || /disconnected/.test(text)) {
    return "Your wallet is disconnected from the network. Check its network settings and try again.";
  }
  if (/insufficient funds|exceeds balance|insufficient balance/.test(text)) {
    return "There isn't enough balance in the wallet (including the network fee) for this.";
  }
  if (/connectornotfound|provider not found|no provider/.test(text)) {
    return "No browser wallet found. Install MetaMask, Coinbase Wallet or another wallet extension — or use WalletConnect.";
  }
  if (/chain ?mismatch|switch.*chain/.test(text)) {
    return `Switch your wallet to ${net} and try again.`;
  }
  return "Your wallet couldn't complete that. Please try again.";
}

/** True when the user deliberately cancelled — callers show it calmly, not as an error. */
export function isUserRejection(err: unknown): boolean {
  return chain(err).some((e) => Number(e.code) === 4001 || /user rejected|user denied/i.test(`${e.message ?? ""} ${e.shortMessage ?? ""}`));
}
