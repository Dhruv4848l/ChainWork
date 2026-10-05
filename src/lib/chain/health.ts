import "server-only";
import { createPublicClient, http, keccak256, toHex, formatEther, parseEther } from "viem";
import {
  RPC_URL,
  CHAIN_ID,
  LOCAL_CHAIN_ID,
  ESCROW_ADDRESS,
  TOKEN_ADDRESS,
  USDT_ADDRESS,
  USDC_ADDRESS,
  phaseEscrowAbi,
  activeChain,
  usesPublicTestMnemonic,
} from "./config";
import { relayerAccount } from "./keystore";
import { paymentMode, paymentModeInfo, PaymentConfigError } from "@/lib/payments/mode";

/*
  Chain health — can the platform actually move escrow right now?

  Demo mode never touches the chain, so it is healthy by definition (the chain checks
  still run, for information, when a chain is configured). In testnet/mainnet mode
  every check must pass: the gate for switching off demo money (payment plan §1).
*/

export interface HealthCheck {
  name: string;
  ok: boolean;
  detail: string;
  /** false = only matters for testnet / mainnet (demo mode never touches the chain). */
  required?: boolean;
}

export interface ChainHealth {
  ok: boolean;
  mode: string;
  modeNotice: string;
  chainId: number;
  relayer: string | null;
  /** Would every chain check pass, i.e. could PAYMENT_MODE switch to testnet right now? */
  testnetReady: boolean;
  /** Plain-language summary of what's left before testnet (empty when ready). */
  testnetTodo: string[];
  checks: HealthCheck[];
  at: string;
}

const MIN_RELAYER_GAS = parseEther(process.env.CHAIN_RELAYER_MIN_GAS ?? "0.5");

async function hasCode(pc: ReturnType<typeof createPublicClient>, address: `0x${string}`): Promise<boolean> {
  if (!address) return false;
  const code = await pc.getCode({ address });
  return Boolean(code && code !== "0x");
}

export async function getChainHealth(): Promise<ChainHealth> {
  const checks: HealthCheck[] = [];
  const at = new Date().toISOString();

  let mode: string;
  try {
    mode = paymentMode();
    checks.push({ name: "payment config", ok: true, detail: `PAYMENT_MODE resolves to "${mode}"` });
  } catch (e) {
    const detail = e instanceof PaymentConfigError ? e.message : String(e);
    return { ok: false, mode: "invalid", modeNotice: detail, chainId: CHAIN_ID, relayer: null, testnetReady: false, testnetTodo: [detail], checks: [{ name: "payment config", ok: false, detail }], at };
  }
  const demo = mode === "demo";

  const publicKeys = CHAIN_ID !== LOCAL_CHAIN_ID && usesPublicTestMnemonic();
  checks.push({
    name: "private keys",
    ok: !publicKeys,
    detail: publicKeys
      ? "CHAIN_MNEMONIC is the public Hardhat phrase on a shared network — every custodial key is public."
      : CHAIN_ID === LOCAL_CHAIN_ID ? "local Hardhat node (public test keys are expected here)" : "custom mnemonic",
  });

  let relayer: string | null = null;
  try {
    relayer = relayerAccount().address;
    const pc = createPublicClient({ chain: activeChain(), transport: http(RPC_URL, { timeout: 8_000 }) });
    const block = await pc.getBlockNumber();
    const remoteId = await pc.getChainId();
    checks.push({ name: "rpc", ok: remoteId === CHAIN_ID, detail: `chain ${remoteId} at block ${block}${remoteId !== CHAIN_ID ? ` (expected ${CHAIN_ID})` : ""}` });

    const [escrowOk, tokenOk] = await Promise.all([hasCode(pc, ESCROW_ADDRESS), hasCode(pc, TOKEN_ADDRESS)]);
    checks.push({ name: "escrow contract", ok: escrowOk, detail: escrowOk ? ESCROW_ADDRESS : `no contract at "${ESCROW_ADDRESS}"` });
    checks.push({ name: "stablecoin contract", ok: tokenOk, detail: tokenOk ? TOKEN_ADDRESS : `no contract at "${TOKEN_ADDRESS}"` });

    if (escrowOk) {
      // P6: the app pays in several assets, which needs PhaseEscrow v2 with each one
      // allowlisted. A v1 contract has no allowedAsset() — the read reverts.
      const assets: [string, string][] = [
        ["cwINR", TOKEN_ADDRESS],
        ...(USDT_ADDRESS ? [["USDT", USDT_ADDRESS] as [string, string]] : []),
        ...(USDC_ADDRESS ? [["USDC", USDC_ADDRESS] as [string, string]] : []),
        ["native coin", "0x0000000000000000000000000000000000000000"],
      ];
      for (const [label, address] of assets) {
        let allowed: boolean | null = null;
        try {
          allowed = (await pc.readContract({ address: ESCROW_ADDRESS, abi: phaseEscrowAbi, functionName: "allowedAsset", args: [address] })) as boolean;
        } catch {
          allowed = null;
        }
        checks.push({
          name: `escrow asset ${label}`,
          ok: allowed === true,
          detail:
            allowed === null
              ? "escrow is not PhaseEscrow v2 — redeploy (contracts/scripts/deploy.js)"
              : allowed
                ? "allowlisted"
                : "not allowlisted — call setAssetAllowed with the deployer key",
        });
      }

      for (const role of ["ATTESTOR_ROLE", "DISPUTE_ROLE"]) {
        const granted = (await pc.readContract({
          address: ESCROW_ADDRESS, abi: phaseEscrowAbi, functionName: "hasRole", args: [keccak256(toHex(role)), relayer],
        })) as boolean;
        checks.push({
          name: `relayer ${role}`,
          ok: granted,
          detail: granted ? "granted" : "missing — run contracts/scripts/grant-roles.js with the deployer key",
        });
      }
    }

    const gas = await pc.getBalance({ address: relayer as `0x${string}` });
    checks.push({
      name: "relayer gas",
      ok: gas >= MIN_RELAYER_GAS,
      detail: `${formatEther(gas)} native (minimum ${formatEther(MIN_RELAYER_GAS)})`,
    });
  } catch (e) {
    checks.push({ name: "rpc", ok: false, detail: `unreachable: ${(e as Error).message.slice(0, 120)}` });
  }

  // Demo mode doesn't depend on the chain; testnet/mainnet need every check green. In demo
  // the chain checks are reported as not required, so red ones read as "to do before
  // testnet", not as an outage.
  checks[0].required = true;
  const chainChecks = checks.slice(1);
  for (const c of chainChecks) c.required = !demo;
  const testnetReady = chainChecks.length > 0 && chainChecks.every((c) => c.ok);
  const testnetTodo = chainChecks.filter((c) => !c.ok).map((c) => `${c.name}: ${c.detail}`);
  const ok = demo ? checks[0].ok : checks.every((c) => c.ok);
  return { ok, mode, modeNotice: paymentModeInfo(mode as never).notice, chainId: CHAIN_ID, relayer, testnetReady, testnetTodo, checks, at };
}
