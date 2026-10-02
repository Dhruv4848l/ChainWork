import "server-only";
import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { getAddress, isAddress, verifyMessage } from "viem";
import { generateSiweNonce, parseSiweMessage } from "viem/siwe";
import { Prisma } from "@/generated/platform";
import { platformDb } from "@/lib/platformDb";
import { sendSms } from "@/lib/sms";
import { sendEmail, emailShell, emailCode } from "@/lib/email";
import { notify } from "@/lib/notify";
import { LINK_TTL_MS, buildLinkMessage, checkLinkMessage, payoutActiveFrom } from "./siwe";

/*
  Linking an external payout wallet — payment plan P3.5 (W5). Three independent proofs:

    1. CONTROL of the address: the wallet signs a server-built Sign-In with Ethereum
       message (our domain, chain, account, single-use nonce, 10-minute expiry).
    2. The ACCOUNT HOLDER is present: a one-time code sent to the phone (or email) on file.
       A stolen session alone can't redirect payouts.
    3. TIME to notice: the new address only receives NEW payouts after a safety hold
       (24 h by default), and every link / unlink is announced by SMS + email.

  Each challenge is consumed exactly once (guarded update), so a captured signature or
  code can't be replayed.
*/

const MIN_RESTART_MS = 20_000;
const MAX_OTP_ATTEMPTS = 5;

function site(): { domain: string; uri: string } {
  const base = new URL(process.env.APP_BASE_URL ?? "http://localhost:3000");
  return { domain: base.host, uri: base.origin };
}

/** Where a user manages their wallet: Earnings (worker) or Payments (client). */
async function walletPageFor(userId: string): Promise<string> {
  const u = await platformDb.user.findUnique({ where: { id: userId }, select: { role: true } });
  return u?.role === "CLIENT" ? "/dashboard/client/payments" : "/dashboard/worker/earnings";
}

const mask = (s: string) => (s.includes("@") ? `${s.slice(0, 2)}•••@${s.split("@")[1]}` : `•••••${s.slice(-3)}`);

export type StartLinkResult = { ok: true; message: string; sentTo: string } | { ok: false; error: string };
export type CompleteLinkResult = { ok: true; address: string; activeFrom: Date | null } | { ok: false; error: string };

export async function startWalletLink(userId: string, address: string, chainId: number): Promise<StartLinkResult> {
  if (!isAddress(address)) return { ok: false, error: "That isn't a valid wallet address." };
  if (!Number.isInteger(chainId) || chainId <= 0) return { ok: false, error: "Unknown network." };
  const addr = getAddress(address);

  const [user, takenByOther, isCustodial, recent] = await Promise.all([
    platformDb.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, email: true, phone: true } }),
    platformDb.wallet.findFirst({ where: { externalAddress: { equals: addr, mode: "insensitive" }, NOT: { userId } }, select: { id: true } }),
    platformDb.wallet.findFirst({ where: { custodialAddress: { equals: addr, mode: "insensitive" } }, select: { id: true } }),
    platformDb.walletLinkChallenge.findFirst({ where: { userId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);
  if (takenByOther) return { ok: false, error: "That wallet is already linked to another ChainWork account." };
  if (isCustodial) return { ok: false, error: "That's a ChainWork-managed wallet — link a wallet you hold the keys to." };
  if (recent && Date.now() - recent.createdAt.getTime() < MIN_RESTART_MS) {
    return { ok: false, error: "Please wait a few seconds before trying again." };
  }

  const nonce = generateSiweNonce();
  const otp = String(randomInt(100000, 1000000));
  const issuedAt = new Date();
  const message = buildLinkMessage({ ...site(), address: addr, chainId, nonce, userId, issuedAt });

  // One open challenge per user: starting again invalidates the previous one.
  await platformDb.walletLinkChallenge.deleteMany({ where: { userId, consumedAt: null } });
  await platformDb.walletLinkChallenge.create({
    data: {
      userId, address: addr.toLowerCase(), chainId, nonce, message,
      otpHash: await bcrypt.hash(otp, 10),
      expiresAt: new Date(issuedAt.getTime() + LINK_TTL_MS),
    },
  });

  const short = `${addr.slice(0, 6)}…${addr.slice(-4)}`;
  if (user.phone) {
    await sendSms(user.phone, `ChainWork: code ${otp} links wallet ${short} for payouts. Valid 10 min. Didn't ask? Ignore this and change your password.`, { otpCode: otp });
    return { ok: true, message, sentTo: mask(user.phone) };
  }
  await sendEmail(
    user.email,
    "Your ChainWork wallet-link code",
    emailShell(
      "Confirm the wallet link",
      `<p>Use this code to link wallet <b>${short}</b> to your ChainWork account for payouts. It's valid for 10 minutes.</p>${emailCode(otp)}<p>Didn't ask for this? Ignore this email and change your password.</p>`,
      `Code ${otp} links ${short} to your ChainWork account`,
    ),
  );
  return { ok: true, message, sentTo: mask(user.email) };
}

export async function completeWalletLink(userId: string, message: string, signature: string, otp: string): Promise<CompleteLinkResult> {
  let nonce: string | undefined;
  try {
    nonce = parseSiweMessage(message).nonce;
  } catch {
    /* handled below */
  }
  if (!nonce) return { ok: false, error: "That isn't a valid sign-in message." };

  const ch = await platformDb.walletLinkChallenge.findUnique({ where: { nonce } });
  if (!ch || ch.userId !== userId) return { ok: false, error: "This signing request doesn't exist. Start again." };
  if (ch.consumedAt) return { ok: false, error: "This signing request was already used. Start again." };
  const now = new Date();
  if (ch.expiresAt <= now) return { ok: false, error: "The signing request expired. Start again." };
  if (ch.attempts >= MAX_OTP_ATTEMPTS) return { ok: false, error: "Too many wrong codes. Start again." };
  if (message !== ch.message) return { ok: false, error: "The signed message was altered." };

  const check = checkLinkMessage(message, { ...site(), address: ch.address, nonce, chainId: ch.chainId, userId, now });
  if (!check.ok) return { ok: false, error: check.reason };

  let signed = false;
  try {
    signed = await verifyMessage({ address: getAddress(ch.address), message, signature: signature as `0x${string}` });
  } catch {
    signed = false;
  }
  if (!signed) return { ok: false, error: "The signature doesn't come from that wallet." };

  if (!/^\d{6}$/.test(otp.trim()) || !(await bcrypt.compare(otp.trim(), ch.otpHash))) {
    await platformDb.walletLinkChallenge.update({ where: { id: ch.id }, data: { attempts: { increment: 1 } } });
    return { ok: false, error: "That code is incorrect." };
  }

  const address = getAddress(ch.address);
  try {
    await platformDb.$transaction(async (tx) => {
      // Single use: a concurrent or replayed completion finds it already consumed.
      const res = await tx.walletLinkChallenge.updateMany({ where: { id: ch.id, consumedAt: null }, data: { consumedAt: now } });
      if (res.count !== 1) throw new Error("ALREADY_CONSUMED");
      await tx.wallet.update({ where: { userId }, data: { externalAddress: address, externalLinkedAt: now } });
    });
  } catch (e) {
    if ((e as Error).message === "ALREADY_CONSUMED") return { ok: false, error: "This signing request was already used. Start again." };
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: "That wallet is already linked to another ChainWork account." };
    }
    throw e;
  }

  const activeFrom = payoutActiveFrom(now);
  const when = activeFrom
    ? activeFrom.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) + " IST"
    : "now";
  await notify({
    userId,
    type: "SYSTEM",
    title: "New payout wallet linked",
    body: `Wallet ${address.slice(0, 6)}…${address.slice(-4)} was linked to your account. New escrow payouts go to it from ${when}. If this wasn't you, unlink it and change your password now.`,
    linkUrl: await walletPageFor(userId),
    channels: ["email", "sms"],
  }).catch((e) => console.warn("wallet-link notice failed:", (e as Error).message));

  return { ok: true, address, activeFrom };
}

export async function unlinkWallet(userId: string): Promise<void> {
  const wallet = await platformDb.wallet.findUnique({ where: { userId }, select: { externalAddress: true } });
  if (!wallet?.externalAddress) return;
  await platformDb.wallet.update({ where: { userId }, data: { externalAddress: null, externalLinkedAt: null } });
  await notify({
    userId,
    type: "SYSTEM",
    title: "Payout wallet unlinked",
    body: `Wallet ${wallet.externalAddress.slice(0, 6)}…${wallet.externalAddress.slice(-4)} was unlinked. Payouts now go to your ChainWork wallet. If this wasn't you, change your password now.`,
    linkUrl: await walletPageFor(userId),
    channels: ["email", "sms"],
  }).catch((e) => console.warn("wallet-unlink notice failed:", (e as Error).message));
}
