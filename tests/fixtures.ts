/*
  Test fixtures (payment plan P7) — fresh, isolated accounts and signed hires for the
  integration tests and the Playwright E2E suite. Every call makes NEW users with unique
  emails / phones, so tests never touch the seeded demo accounts and can run repeatedly.
  Server-side only: run under `node --conditions react-server --import tsx`.
*/
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { platformDb as db } from "@/lib/platformDb";
import { provisionWallet } from "@/lib/chain/keystore";

export const TEST_PASSWORD = "password123";

const uid = () => Date.now().toString(36) + randomBytes(3).toString("hex");
const phone = () => "7" + String(Math.floor(Math.random() * 1e9)).padStart(9, "0");

export interface TestUser {
  id: string;
  email: string;
  phone: string;
  name: string;
  custodialAddress: `0x${string}`;
}

/**
 * A ready-to-use account: phone + email verified, onboarded, KYC VERIFIED (so the money
 * gate passes), with a provisioned custodial wallet. `externalAddress` links an own wallet;
 * `linkedHoursAgo` (default 48) places it past or inside the payout safety hold.
 */
export async function makeUser(
  role: "CLIENT" | "WORKER",
  opts: { name?: string; externalAddress?: string; linkedHoursAgo?: number } = {},
): Promise<TestUser> {
  const id = uid();
  const p = phone();
  const name = opts.name ?? (role === "CLIENT" ? `Test Client ${id.slice(-4)}` : `Test Worker ${id.slice(-4)}`);
  const user = await db.user.create({
    data: {
      role, name, email: `${role.toLowerCase()}-${id}@test.chainwork.dev`, phone: p,
      passwordHash: await bcrypt.hash(TEST_PASSWORD, 8),
      kycTier: "VERIFIED", emailVerified: true, phoneVerified: true, onboarded: true,
      ...(role === "CLIENT" ? { clientProfile: { create: {} } } : { workerProfile: { create: {} } }),
      wallet: { create: { custodialAddress: `pending-${id}` } },
    },
  });
  const { address } = await provisionWallet(user.id);
  if (opts.externalAddress) {
    await db.wallet.update({
      where: { userId: user.id },
      data: { externalAddress: opts.externalAddress, externalLinkedAt: new Date(Date.now() - (opts.linkedHoursAgo ?? 48) * 3600_000) },
    });
  }
  return { id: user.id, email: user.email, phone: p, name, custodialAddress: address };
}

/** A hire with a contract both parties have signed, one PENDING_FUNDING phase per amount. */
export async function makeSignedHire(clientId: string, workerId: string, amounts: number[] = [1500]) {
  const category = await db.category.findFirstOrThrow();
  const total = amounts.reduce((a, b) => a + b, 0);
  const job = await db.job.create({
    data: {
      clientId, title: "E2E test job", description: "Created by the test fixtures.", categoryId: category.id, status: "ARCHIVED", // kept out of Find Jobs
      roleLineItems: { create: [{ roleName: "Helper", headcount: 1, perPersonRate: total, hiredCount: 1 }] },
    },
    include: { roleLineItems: true },
  });
  const [client, worker] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: clientId } }),
    db.user.findUniqueOrThrow({ where: { id: workerId } }),
  ]);
  const hire = await db.hire.create({
    data: {
      jobId: job.id, roleLineItemId: job.roleLineItems[0].id, clientId, workerId, totalValue: total,
      contract: {
        create: {
          totalValue: total, scope: "Test scope", documentHash: "test-" + uid(),
          clientSignature: client.name, clientSignedAt: new Date(), workerSignature: worker.name, workerSignedAt: new Date(),
        },
      },
      phases: { create: amounts.map((amount, i) => ({ index: i + 1, name: `Test phase ${i + 1}`, amount })) },
    },
    include: { phases: { orderBy: { index: "asc" } } },
  });
  return { hireId: hire.id, phaseIds: hire.phases.map((p) => p.id) };
}
