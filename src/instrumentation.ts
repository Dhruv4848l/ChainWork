/*
  Runs once when a Next.js server instance starts, before it serves any request.
  Payment safety: a configuration that could move REAL money by accident (mainnet mode
  without an audit sign-off, or a real-value CHAIN_ID outside mainnet mode) stops the
  server here. Softer problems — e.g. public test keys on Amoy — don't block startup
  (demo mode never signs anything); the chain adapter refuses to sign instead and
  /api/health/chain reports it.
*/
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertPaymentConfig, paymentModeInfo } = await import("@/lib/payments/mode");
  const mode = assertPaymentConfig(); // throws PaymentConfigError → server does not start
  console.log(`[payments] mode=${mode} — ${paymentModeInfo(mode).notice}`);

  if (mode !== "demo") {
    const { CHAIN_ID, LOCAL_CHAIN_ID, usesPublicTestMnemonic } = await import("@/lib/chain/config");
    if (CHAIN_ID !== LOCAL_CHAIN_ID && usesPublicTestMnemonic()) {
      console.error(
        `[payments] ✖ CHAIN_MNEMONIC is the public Hardhat phrase on chain ${CHAIN_ID}. ` +
          "Escrow writes are refused until it is replaced — see /api/health/chain.",
      );
    }
  }
}
