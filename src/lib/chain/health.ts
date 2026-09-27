import "server-only";
import { createPublicClient, http, keccak256, toHex, formatEther, parseEther } from "viem";
import {
  RPC_URL,
  CHAIN_ID,
  LOCAL_CHAIN_ID,
  ESCROW_ADDRESS,
  TOKEN_ADDRESS,
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
}

export interface ChainHealth {
  ok: boolean;
  mode: string;
  modeNotice: string;
  chainId: number;
  relayer: string | null;
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
    return { ok: false, mode: "invalid", modeNotice: detail, chainId: CHAIN_ID, relayer: null, checks: [{ name: "payment config", ok: false, detail }], at };
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

  // Demo mode doesn't depend on the chain; testnet/mainnet need every check green.
  const ok = demo ? checks[0].ok : checks.every((c) => c.ok);
  return { ok, mode, modeNotice: paymentModeInfo(mode as never).notice, chainId: CHAIN_ID, relayer, checks, at };
}
