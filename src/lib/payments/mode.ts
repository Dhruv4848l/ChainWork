/*
  PAYMENT MODE — the one switch that decides whether money is real.

    demo     Dummy money. No chain at all: a DB-backed simulation of the stablecoin +
             PhaseEscrow contract (src/lib/chain/demoAdapter.ts) that enforces the same
             rules. MetaMask users still connect for real; they authorise with a
             signature and only demo money moves. Every record is stamped DEMO.
    testnet  Real transactions on a test network (local Hardhat or Polygon Amoy) with
             test tokens that have no value.
    mainnet  Real money. HARD-LOCKED until a professional smart-contract audit: the
             server refuses to start unless MAINNET_AUDIT_APPROVED is also set.

  Resolution order:
    1. PAYMENT_MODE, if set (demo | testnet | mainnet).
    2. Legacy MOCK_BLOCKCHAIN=true  -> demo  (keeps the deployed site behaving as today).
    3. Otherwise                    -> testnet.  Removing the flag NEVER means real money.

  This module is plain TS (no server-only) so it can be unit-tested; it only reads env.
*/

export type PaymentMode = "demo" | "testnet" | "mainnet";

type Env = Record<string, string | undefined>;

const MODES: readonly PaymentMode[] = ["demo", "testnet", "mainnet"];

/** Chain ids that carry real value. Pointing CHAIN_ID at one needs mainnet mode. */
export const MAINNET_CHAIN_IDS: ReadonlySet<number> = new Set([
  1, // Ethereum
  137, // Polygon PoS
  56, // BNB Smart Chain
  8453, // Base
  42161, // Arbitrum One
  10, // Optimism
]);

export class PaymentConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentConfigError";
  }
}

/** Resolve the payment mode from an env map. Throws on an unknown PAYMENT_MODE value. */
export function resolvePaymentMode(env: Env = process.env): PaymentMode {
  const raw = env.PAYMENT_MODE?.trim().toLowerCase();
  if (raw) {
    if (!(MODES as readonly string[]).includes(raw)) {
      throw new PaymentConfigError(`PAYMENT_MODE="${env.PAYMENT_MODE}" is not one of: ${MODES.join(", ")}.`);
    }
    return raw as PaymentMode;
  }
  if (env.MOCK_BLOCKCHAIN?.trim().toLowerCase() === "true") return "demo";
  return "testnet";
}

/**
 * Validate the whole payment configuration. Returns the mode, or throws a
 * PaymentConfigError describing exactly what is unsafe. Called once at server start
 * (src/instrumentation.ts) so a dangerous config never serves a request.
 */
export function assertPaymentConfig(env: Env = process.env): PaymentMode {
  const mode = resolvePaymentMode(env);
  const chainId = Number(env.CHAIN_ID ?? "31337");

  if (mode === "mainnet" && !env.MAINNET_AUDIT_APPROVED?.trim()) {
    throw new PaymentConfigError(
      "PAYMENT_MODE=mainnet is locked: set MAINNET_AUDIT_APPROVED=<audit reference> only after a " +
        "professional smart-contract audit (docs/PRE_MAINNET_CHECKLIST.md).",
    );
  }
  if (mode !== "mainnet" && MAINNET_CHAIN_IDS.has(chainId)) {
    throw new PaymentConfigError(
      `CHAIN_ID=${chainId} is a real-value network but PAYMENT_MODE is "${mode}". ` +
        "Point CHAIN_* at a testnet (Amoy 80002) or local Hardhat (31337).",
    );
  }
  return mode;
}

let cached: PaymentMode | null = null;

/** The active payment mode for this server process (memoised). */
export function paymentMode(): PaymentMode {
  if (cached === null) cached = assertPaymentConfig();
  return cached;
}

export function isDemoMode(): boolean {
  return paymentMode() === "demo";
}

/** Test hook — forget the memoised mode. */
export function resetPaymentModeCache(): void {
  cached = null;
}

export interface PaymentModeInfo {
  mode: PaymentMode;
  label: string;
  /** One line for banners and receipts. */
  notice: string;
  /** Receipt/PDF watermark; null when the money is real. */
  watermark: string | null;
}

export function paymentModeInfo(mode: PaymentMode = paymentMode()): PaymentModeInfo {
  switch (mode) {
    case "demo":
      return {
        mode,
        label: "Demo money",
        notice: "Demo mode — payments use dummy money. Nothing here has real value.",
        watermark: "DEMO — NO REAL MONEY",
      };
    case "testnet":
      return {
        mode,
        label: "Testnet",
        notice: "Testnet — real transactions with test tokens that have no value.",
        watermark: "TESTNET — NO REAL VALUE",
      };
    case "mainnet":
      return { mode, label: "Live", notice: "Live payments.", watermark: null };
  }
}
