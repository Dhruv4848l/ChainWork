/*
  Jury integrity regression tests (roadmap Stage 2 — F2 / F3) against the REAL local
  Postgres databases. No chain needed: these cases are opened directly in the admin DB.

    npm run test:integration

  Each test opens its own case with fresh test jurors (fresh platform users + their own
  console logins). Draws for replacements / appeals may also seat seeded jurors; no test
  ever finalizes a case holding them, so seeded juror stakes are never touched. Everything
  the suite creates in the admin DB is removed afterwards (audit rows stay — append-only).
*/
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { adminDb as adb } from "@/lib/adminDb";
import {
  appealCase, claimSettlement, commitVote, jurorForAdmin, releaseSettlementClaim, revealVote, runJuryTick, tallyAndFinalize,
} from "@/lib/admin/jury";
import { voteCommitHash, type VerdictChoice } from "@/lib/admin/voting";
import { makeSignedHire, makeUser } from "../fixtures";

const HOUR = 3600_000;
const isLocal = (url?: string) => !!url && ["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname);

let skip: string | null = null;
let hire: { hireId: string; phaseIds: string[] };
const jurors: { id: string; adminUserId: string }[] = [];
const extraAdmins: string[] = [];
const caseIds: string[] = [];

async function makeJuror(stake = 1000) {
  const u = await makeUser("WORKER", { provision: false });
  const login = await adb.adminUser.create({
    data: { email: `juror.${u.email.split("@")[0]}@test.chainwork.local`, passwordHash: "x", name: u.name, role: "JURY" },
  });
  const j = await adb.jurorProfile.create({
    data: { platformUserId: u.id, adminUserId: login.id, displayName: u.name, stakeBalance: stake, status: "ACTIVE" },
  });
  jurors.push({ id: j.id, adminUserId: login.id });
  return j;
}

/** A case seated with exactly these jurors (no random draw), deadlines in the future. */
async function openCase(jurorIds: string[], over: { commitDeadline?: Date; revealDeadline?: Date } = {}) {
  const now = Date.now();
  const c = await adb.disputeCase.create({
    data: {
      subjectHireId: hire.hireId, subjectPhaseId: hire.phaseIds[0], clientLabel: "Client #0001", workerLabel: "Worker #0002",
      reason: "jury integration test", valueTier: "SMALL", panelSize: jurorIds.length, escrowAmount: 1500, status: "COMMIT",
      commitDeadline: over.commitDeadline ?? new Date(now + 48 * HOUR),
      revealDeadline: over.revealDeadline ?? new Date(now + 72 * HOUR),
    },
  });
  for (const jurorId of jurorIds) {
    await adb.juryAssignment.create({ data: { caseId: c.id, jurorId } });
    await adb.juryVote.create({ data: { caseId: c.id, jurorId } });
  }
  caseIds.push(c.id);
  return c.id;
}

const salt = (caseId: string, jurorId: string) => `salt-${caseId}-${jurorId}`;
async function commitAs(caseId: string, jurorId: string, choice: VerdictChoice, split = 0) {
  return commitVote(caseId, jurorId, voteCommitHash(choice, split, salt(caseId, jurorId)));
}
async function revealAs(caseId: string, jurorId: string, choice: VerdictChoice, split = 0) {
  return revealVote(caseId, jurorId, choice, split, salt(caseId, jurorId));
}
const stakeOf = async (id: string) => Number((await adb.jurorProfile.findUniqueOrThrow({ where: { id } })).stakeBalance);
const statusOf = async (id: string) => (await adb.disputeCase.findUniqueOrThrow({ where: { id } })).status;

before(async () => {
  if (!isLocal(process.env.DATABASE_URL) || !isLocal(process.env.ADMIN_DATABASE_URL)) {
    skip = "the jury tests only run against local databases (DATABASE_URL / ADMIN_DATABASE_URL on localhost).";
    return;
  }
  try {
    await adb.$queryRaw`SELECT 1`;
  } catch {
    skip = "Postgres isn't reachable.";
    return;
  }
  const [client, worker] = await Promise.all([makeUser("CLIENT", { provision: false }), makeUser("WORKER", { provision: false })]);
  hire = await makeSignedHire(client.id, worker.id, [1500]);
  for (let i = 0; i < 5; i++) await makeJuror();
});

after(async () => {
  if (skip) return;
  const appeals = await adb.disputeCase.findMany({ where: { appealOfCaseId: { in: caseIds } }, select: { id: true } });
  await adb.disputeCase.deleteMany({ where: { id: { in: [...caseIds, ...appeals.map((a) => a.id)] } } });
  for (const j of jurors) {
    // Still seated on some other case (a draw elsewhere)? Then retire instead of deleting.
    await adb.jurorProfile.delete({ where: { id: j.id } }).catch(() => adb.jurorProfile.update({ where: { id: j.id }, data: { status: "SUSPENDED", adminUserId: null } }));
  }
  await adb.adminUser.deleteMany({ where: { id: { in: [...jurors.map((j) => j.adminUserId), ...extraAdmins] } } }).catch(() => {});
});

describe("F2 — a juror votes only as themselves", () => {
  it("resolves the juror from the console login; an unlinked login has none", async (t) => {
    if (skip) return t.skip(skip);
    const j = jurors[0];
    assert.equal((await jurorForAdmin(j.adminUserId))?.id, j.id);
    const lone = await adb.adminUser.create({ data: { email: `lone.${Date.now()}@test.chainwork.local`, passwordHash: "x", name: "Lone admin", role: "JURY" } });
    extraAdmins.push(lone.id);
    assert.equal(await jurorForAdmin(lone.id), null);
  });

  it("a juror who isn't on the panel can't commit to it", async (t) => {
    if (skip) return t.skip(skip);
    const caseId = await openCase([jurors[0].id, jurors[1].id, jurors[2].id]);
    const r = await commitAs(caseId, jurors[3].id, "SPLIT", 50);
    assert.equal(r.ok, false);
    assert.match(!r.ok ? r.error : "", /not on this panel/);
  });
});

describe("F3 — the case state machine", () => {
  it("full round: commit → reveal → finalize once, stakes settle once", async (t) => {
    if (skip) return t.skip(skip);
    const [a, b, c, d, e] = jurors.map((j) => j.id);
    const caseId = await openCase([a, b, c, d, e]);
    const before = await Promise.all([a, b, c, d, e].map(stakeOf));

    assert.equal((await commitVote(caseId, a, "0xnot-a-hash")).ok, false, "malformed commitment refused");
    assert.equal((await revealAs(caseId, a, "SPLIT", 60)).ok, false, "reveal refused while still in COMMIT");

    await commitAs(caseId, a, "SPLIT", 60);
    assert.equal((await commitAs(caseId, a, "REFUND_CLIENT")).ok, false, "a commit can't be changed");
    await commitAs(caseId, b, "SPLIT", 40);
    await commitAs(caseId, c, "SPLIT", 50);
    await commitAs(caseId, d, "RELEASE_WORKER");
    assert.equal(await statusOf(caseId), "COMMIT");
    await commitAs(caseId, e, "REFUND_CLIENT");
    assert.equal(await statusOf(caseId), "REVEAL", "the last commit opens the reveal stage");

    assert.equal((await revealVote(caseId, a, "SPLIT", 60, "wrong-salt")).ok, false, "a reveal that doesn't match is rejected");
    await revealAs(caseId, a, "SPLIT", 60);
    await revealAs(caseId, b, "SPLIT", 40);
    await revealAs(caseId, c, "SPLIT", 50);
    const early = await tallyAndFinalize(caseId);
    assert.equal(early.ok, false, "quorum alone isn't enough while jurors can still reveal");
    await revealAs(caseId, d, "RELEASE_WORKER");
    await revealAs(caseId, e, "REFUND_CLIENT");

    // Two finalizes at once: exactly one wins.
    const results = await Promise.all([tallyAndFinalize(caseId), tallyAndFinalize(caseId)]);
    assert.equal(results.filter((r) => r.ok).length, 1, "exactly one finalize succeeds");
    const won = results.find((r) => r.ok);
    assert.ok(won && won.ok);
    assert.equal(won.verdict, "SPLIT");
    assert.equal(won.splitPct, 50, "median of 60/40/50");
    assert.equal((await tallyAndFinalize(caseId)).ok, false, "a later finalize is refused too");

    const after = await Promise.all([a, b, c, d, e].map(stakeOf));
    assert.deepEqual(after.map((s, i) => s - before[i]), [100, 100, 100, -200, -200], "majority +fee, minority slashed — once");
  });

  it("settlement is claimed once; a failed payment gives the claim back", async (t) => {
    if (skip) return t.skip(skip);
    const [a, b, c] = jurors.map((j) => j.id);
    const caseId = await openCase([a, b, c]);
    for (const id of [a, b, c]) await commitAs(caseId, id, "RELEASE_WORKER");
    for (const id of [a, b, c]) await revealAs(caseId, id, "RELEASE_WORKER");
    assert.ok((await tallyAndFinalize(caseId)).ok);

    const [x, y] = await Promise.all([claimSettlement(caseId), claimSettlement(caseId)]);
    assert.equal([x, y].filter((r) => r.ok).length, 1, "double settle: one claim wins");
    assert.equal(await statusOf(caseId), "EXECUTED");
    await releaseSettlementClaim(caseId);
    assert.equal(await statusOf(caseId), "VERDICT");
    assert.equal((await claimSettlement(caseId)).ok, true, "claimable again after a failed payment");
  });

  it("appeal: once, only from a verdict, never of an appeal; the appealed case can't settle", async (t) => {
    if (skip) return t.skip(skip);
    const [a, b, c] = jurors.map((j) => j.id);
    const caseId = await openCase([a, b, c]);
    assert.equal((await appealCase(caseId)).ok, false, "no appeal before a verdict");
    for (const id of [a, b, c]) await commitAs(caseId, id, "REFUND_CLIENT");
    for (const id of [a, b, c]) await revealAs(caseId, id, "REFUND_CLIENT");
    assert.ok((await tallyAndFinalize(caseId)).ok);

    const appeal = await appealCase(caseId);
    assert.ok(appeal.ok, !appeal.ok ? appeal.error : "");
    assert.equal(await statusOf(caseId), "APPEALED");
    assert.equal((await appealCase(caseId)).ok, false, "a second appeal is refused");
    assert.equal((await claimSettlement(caseId)).ok, false, "an APPEALED case can't be settled");

    const seated = await adb.juryAssignment.findMany({ where: { caseId: appeal.appealId }, select: { jurorId: true } });
    assert.ok(seated.every((s) => ![a, b, c].includes(s.jurorId)), "the appeal panel is all-new jurors");

    await adb.disputeCase.update({ where: { id: appeal.appealId }, data: { status: "VERDICT", verdictChoice: "SPLIT", verdictSplitPct: 50 } });
    const again = await appealCase(appeal.appealId);
    assert.equal(again.ok, false);
    assert.match(!again.ok ? again.error : "", /already an appeal/);
  });

  it("a slash never takes a juror's stake below zero", async (t) => {
    if (skip) return t.skip(skip);
    const poor = await makeJuror(150);
    const [a, b] = jurors.map((j) => j.id);
    const caseId = await openCase([a, b, poor.id]);
    await commitAs(caseId, a, "RELEASE_WORKER");
    await commitAs(caseId, b, "RELEASE_WORKER");
    await commitAs(caseId, poor.id, "REFUND_CLIENT");
    for (const [id, ch] of [[a, "RELEASE_WORKER"], [b, "RELEASE_WORKER"], [poor.id, "REFUND_CLIENT"]] as const) await revealAs(caseId, id, ch);
    assert.ok((await tallyAndFinalize(caseId)).ok);
    assert.equal(await stakeOf(poor.id), 0);
  });
});

describe("F3 — deadlines (the jury timer)", () => {
  it("commits and reveals after their deadline are refused", async (t) => {
    if (skip) return t.skip(skip);
    const [a] = jurors.map((j) => j.id);
    const caseId = await openCase([a], { commitDeadline: new Date(Date.now() - HOUR) });
    const r = await commitAs(caseId, a, "SPLIT", 50);
    assert.equal(r.ok, false);
    assert.match(!r.ok ? r.error : "", /deadline/);
  });

  it("commit deadline: non-committers are dropped and replaced; a second tick is a no-op", async (t) => {
    if (skip) return t.skip(skip);
    const [a, b, c] = jurors.map((j) => j.id);
    const caseId = await openCase([a, b, c]);
    await commitAs(caseId, a, "RELEASE_WORKER");
    await commitAs(caseId, b, "RELEASE_WORKER");
    await adb.disputeCase.update({ where: { id: caseId }, data: { commitDeadline: new Date(Date.now() - HOUR) } });

    const r = await runJuryTick(new Date(), [caseId]);
    assert.deepEqual(r.errors, []);
    assert.equal(r.removedNonCommitters, 1);
    const removed = await adb.juryAssignment.findFirstOrThrow({ where: { caseId, jurorId: c } });
    assert.ok(removed.removedAt, "the non-committer is off the panel");
    assert.equal(await adb.juryVote.count({ where: { caseId, jurorId: c } }), 0);
    const cs = await adb.disputeCase.findUniqueOrThrow({ where: { id: caseId } });
    if (r.seated > 0) {
      assert.equal(cs.status, "COMMIT");
      assert.ok(cs.commitDeadline! > new Date(), "the replacement gets a fresh commit window");
    } else {
      assert.equal(cs.status, "REVEAL", "nobody to draw: the two who committed decide");
    }
    assert.equal(cs.panelSize, await adb.juryVote.count({ where: { caseId } }), "panel size = jurors actually seated");

    const again = await runJuryTick(new Date(), [caseId]);
    assert.equal(again.removedNonCommitters + again.seated + again.redrawn + again.finalized, 0, "idempotent");
  });

  it("reveal deadline with quorum: finalizes and slashes the juror who never revealed", async (t) => {
    if (skip) return t.skip(skip);
    const [a, b, c] = jurors.map((j) => j.id);
    const caseId = await openCase([a, b, c]);
    for (const id of [a, b, c]) await commitAs(caseId, id, "RELEASE_WORKER");
    await revealAs(caseId, a, "RELEASE_WORKER");
    await revealAs(caseId, b, "RELEASE_WORKER");
    const cBefore = await stakeOf(c);
    await adb.disputeCase.update({ where: { id: caseId }, data: { revealDeadline: new Date(Date.now() - HOUR) } });

    const r = await runJuryTick(new Date(), [caseId]);
    assert.equal(r.finalized, 1);
    assert.equal(await statusOf(caseId), "VERDICT");
    assert.equal(cBefore - (await stakeOf(c)), 200, "non-revealer slashed");
  });

  it("reveal deadline without quorum: non-revealers slashed and a fresh panel drawn", async (t) => {
    if (skip) return t.skip(skip);
    const [a, b, c] = jurors.map((j) => j.id);
    const caseId = await openCase([a, b, c]);
    for (const id of [a, b, c]) await commitAs(caseId, id, "SPLIT", 50);
    await revealAs(caseId, a, "SPLIT", 50);
    const [bBefore, cBefore] = [await stakeOf(b), await stakeOf(c)];
    await adb.disputeCase.update({ where: { id: caseId }, data: { revealDeadline: new Date(Date.now() - HOUR) } });

    const r = await runJuryTick(new Date(), [caseId]);
    assert.equal(r.redrawn, 1);
    assert.equal(await statusOf(caseId), "COMMIT");
    assert.equal(bBefore - (await stakeOf(b)), 200);
    assert.equal(cBefore - (await stakeOf(c)), 200);
    const active = await adb.juryAssignment.findMany({ where: { caseId, removedAt: null }, select: { jurorId: true } });
    assert.ok(active.every((x) => ![a, b, c].includes(x.jurorId)), "nobody from the failed round is redrawn");
    assert.equal(await adb.juryVote.count({ where: { caseId, commitHash: { not: null } } }), 0, "the new round starts clean");
  });
});
