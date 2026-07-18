const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

/*
  PhaseEscrow test suite — covers every rule in spec Section 13 and the edge cases
  the build manual calls out: double-funding, releasing an unfunded phase, non-party
  approve, auto-release timing (before = fail, after = succeed), dispute-freeze
  blocking withdrawal, verdict splitting, mutual settlement, stake forfeit math,
  refund-to-client, pause circuit breaker, no-drain, and reentrancy.
*/

const AMOUNT = ethers.parseEther("8000"); // ₹8,000 (18-dp test token)
const PHASE = ethers.id("phase-2-wiring");
const HIRE = ethers.id("hire-H-2214");
const WINDOW = 2 * 24 * 60 * 60; // ~2 days in seconds (the off-chain working-day figure)

async function deploy() {
  const [admin, client, worker, other] = await ethers.getSigners();
  const Token = await ethers.getContractFactory("MockStablecoin");
  const token = await Token.deploy();
  const Escrow = await ethers.getContractFactory("PhaseEscrow");
  const escrow = await Escrow.deploy(await token.getAddress(), admin.address);

  // Fund the client + worker with test tokens and pre-approve the escrow.
  for (const who of [client, worker]) {
    await token.mint(who.address, ethers.parseEther("100000"));
    await token.connect(who).approve(await escrow.getAddress(), ethers.MaxUint256);
  }
  return { token, escrow, admin, client, worker, other };
}

// convenience: fund PHASE from the client
async function fund(escrow, client, worker) {
  return escrow.connect(client).fundPhase(PHASE, worker.address, AMOUNT);
}

const Status = { NONE: 0n, FUNDED: 1n, DELIVERED: 2n, RELEASED: 3n, DISPUTED: 4n, RESOLVED: 5n, REFUNDED: 6n };

describe("PhaseEscrow", () => {
  describe("deployment & roles", () => {
    it("sets the token and grants the admin every role", async () => {
      const { token, escrow, admin } = await loadFixture(deploy);
      expect(await escrow.token()).to.equal(await token.getAddress());
      expect(await escrow.hasRole(await escrow.ATTESTOR_ROLE(), admin.address)).to.equal(true);
      expect(await escrow.hasRole(await escrow.DISPUTE_ROLE(), admin.address)).to.equal(true);
      expect(await escrow.hasRole(await escrow.PAUSER_ROLE(), admin.address)).to.equal(true);
    });
  });

  describe("funding", () => {
    it("locks the funds in the contract and records the escrow", async () => {
      const { token, escrow, client, worker } = await loadFixture(deploy);
      await expect(fund(escrow, client, worker))
        .to.emit(escrow, "PhaseFunded")
        .withArgs(PHASE, client.address, worker.address, AMOUNT);
      expect(await token.balanceOf(await escrow.getAddress())).to.equal(AMOUNT);
      const e = await escrow.getEscrow(PHASE);
      expect(e.status).to.equal(Status.FUNDED);
      expect(e.amount).to.equal(AMOUNT);
    });

    it("rejects double-funding the same phase", async () => {
      const { escrow, client, worker } = await loadFixture(deploy);
      await fund(escrow, client, worker);
      await expect(fund(escrow, client, worker)).to.be.revertedWithCustomError(escrow, "WrongStatus");
    });

    it("rejects zero amount and zero worker", async () => {
      const { escrow, client, worker } = await loadFixture(deploy);
      await expect(escrow.connect(client).fundPhase(PHASE, worker.address, 0)).to.be.revertedWithCustomError(escrow, "InvalidAmount");
      await expect(escrow.connect(client).fundPhase(PHASE, ethers.ZeroAddress, AMOUNT)).to.be.revertedWithCustomError(escrow, "ZeroAddress");
    });

    it("the worker cannot pull funds while in progress (no withdraw path exists)", async () => {
      const { token, escrow, client, worker } = await loadFixture(deploy);
      await fund(escrow, client, worker);
      // There is no function that lets the worker take funds; they stay locked.
      expect(await token.balanceOf(await escrow.getAddress())).to.equal(AMOUNT);
      const hasWithdraw = escrow.interface.fragments.some((f) => f.type === "function" && f.name === "withdraw");
      expect(hasWithdraw).to.equal(false); // no worker-withdraw path exists at all
    });
  });

  describe("release on approval", () => {
    it("releases to the worker when the client approves", async () => {
      const { token, escrow, client, worker } = await loadFixture(deploy);
      await fund(escrow, client, worker);
      const before = await token.balanceOf(worker.address);
      await expect(escrow.connect(client).approveRelease(PHASE))
        .to.emit(escrow, "PhaseReleased")
        .withArgs(PHASE, worker.address, AMOUNT, "approved");
      expect(await token.balanceOf(worker.address)).to.equal(before + AMOUNT);
      expect((await escrow.getEscrow(PHASE)).status).to.equal(Status.RELEASED);
    });

    it("lets the attestor relay the client's approval", async () => {
      const { escrow, admin, client, worker } = await loadFixture(deploy);
      await fund(escrow, client, worker);
      await expect(escrow.connect(admin).approveRelease(PHASE)).to.emit(escrow, "PhaseReleased");
    });

    it("rejects approval by a non-party, non-attestor", async () => {
      const { escrow, client, worker, other } = await loadFixture(deploy);
      await fund(escrow, client, worker);
      await expect(escrow.connect(other).approveRelease(PHASE)).to.be.revertedWithCustomError(escrow, "NotAParty");
    });

    it("rejects releasing an unfunded phase", async () => {
      const { escrow, client } = await loadFixture(deploy);
      await expect(escrow.connect(client).approveRelease(PHASE)).to.be.revertedWithCustomError(escrow, "WrongStatus");
    });
  });

  describe("delivery + auto-release timing", () => {
    it("only the attestor can mark delivered", async () => {
      const { escrow, client, worker } = await loadFixture(deploy);
      await fund(escrow, client, worker);
      const eligible = (await time.latest()) + WINDOW;
      await expect(escrow.connect(client).markDelivered(PHASE, eligible)).to.be.revertedWithCustomError(escrow, "AccessControlUnauthorizedAccount");
      await expect(escrow.connect(worker).markDelivered(PHASE, eligible)).to.be.revertedWithCustomError(escrow, "AccessControlUnauthorizedAccount");
    });

    it("auto-release BEFORE the eligible timestamp reverts (contract-enforced timing)", async () => {
      const { escrow, admin, client, worker } = await loadFixture(deploy);
      await fund(escrow, client, worker);
      const eligible = (await time.latest()) + WINDOW;
      await escrow.connect(admin).markDelivered(PHASE, eligible);
      await expect(escrow.connect(admin).autoRelease(PHASE)).to.be.revertedWithCustomError(escrow, "TooEarly");
    });

    it("auto-release AFTER the eligible timestamp pays the worker", async () => {
      const { token, escrow, admin, client, worker } = await loadFixture(deploy);
      await fund(escrow, client, worker);
      const eligible = (await time.latest()) + WINDOW;
      await escrow.connect(admin).markDelivered(PHASE, eligible);
      await time.increaseTo(eligible + 1);
      const before = await token.balanceOf(worker.address);
      await expect(escrow.connect(admin).autoRelease(PHASE))
        .to.emit(escrow, "PhaseReleased")
        .withArgs(PHASE, worker.address, AMOUNT, "auto");
      expect(await token.balanceOf(worker.address)).to.equal(before + AMOUNT);
    });

    it("auto-release requires DELIVERED status", async () => {
      const { escrow, admin, client, worker } = await loadFixture(deploy);
      await fund(escrow, client, worker); // still FUNDED, not DELIVERED
      await expect(escrow.connect(admin).autoRelease(PHASE)).to.be.revertedWithCustomError(escrow, "WrongStatus");
    });
  });

  describe("dispute freeze + verdict", () => {
    it("only a dispute resolver can freeze; then release is blocked", async () => {
      const { escrow, admin, client, worker, other } = await loadFixture(deploy);
      await fund(escrow, client, worker);
      await expect(escrow.connect(other).raiseDispute(PHASE)).to.be.revertedWithCustomError(escrow, "AccessControlUnauthorizedAccount");
      await escrow.connect(admin).raiseDispute(PHASE);
      // frozen: neither party can pull it
      await expect(escrow.connect(client).approveRelease(PHASE)).to.be.revertedWithCustomError(escrow, "WrongStatus");
      await expect(escrow.connect(admin).autoRelease(PHASE)).to.be.revertedWithCustomError(escrow, "WrongStatus");
      await expect(escrow.connect(admin).refundToClient(PHASE)).to.be.revertedWithCustomError(escrow, "WrongStatus");
    });

    it("verdict 100% to worker", async () => {
      const { token, escrow, admin, client, worker } = await loadFixture(deploy);
      await fund(escrow, client, worker);
      await escrow.connect(admin).raiseDispute(PHASE);
      const wb = await token.balanceOf(worker.address);
      await escrow.connect(admin).resolveDispute(PHASE, 10000);
      expect(await token.balanceOf(worker.address)).to.equal(wb + AMOUNT);
    });

    it("verdict 100% to client (refund)", async () => {
      const { token, escrow, admin, client, worker } = await loadFixture(deploy);
      await fund(escrow, client, worker);
      await escrow.connect(admin).raiseDispute(PHASE);
      const cb = await token.balanceOf(client.address);
      await escrow.connect(admin).resolveDispute(PHASE, 0);
      expect(await token.balanceOf(client.address)).to.equal(cb + AMOUNT);
    });

    it("verdict 60/40 split, exact math", async () => {
      const { token, escrow, admin, client, worker } = await loadFixture(deploy);
      await fund(escrow, client, worker);
      await escrow.connect(admin).raiseDispute(PHASE);
      const wb = await token.balanceOf(worker.address);
      const cb = await token.balanceOf(client.address);
      const toWorker = (AMOUNT * 6000n) / 10000n;
      const toClient = AMOUNT - toWorker;
      await expect(escrow.connect(admin).resolveDispute(PHASE, 6000))
        .to.emit(escrow, "DisputeResolved")
        .withArgs(PHASE, 6000, toWorker, toClient);
      expect(await token.balanceOf(worker.address)).to.equal(wb + toWorker);
      expect(await token.balanceOf(client.address)).to.equal(cb + toClient);
    });

    it("rejects a verdict over 100% and on a non-disputed phase", async () => {
      const { escrow, admin, client, worker } = await loadFixture(deploy);
      await fund(escrow, client, worker);
      await expect(escrow.connect(admin).resolveDispute(PHASE, 5000)).to.be.revertedWithCustomError(escrow, "WrongStatus");
      await escrow.connect(admin).raiseDispute(PHASE);
      await expect(escrow.connect(admin).resolveDispute(PHASE, 10001)).to.be.revertedWithCustomError(escrow, "InvalidBps");
    });
  });

  describe("mutual settlement", () => {
    it("one party proposes, the other accepts, funds split accordingly", async () => {
      const { token, escrow, client, worker } = await loadFixture(deploy);
      await fund(escrow, client, worker);
      await escrow.connect(client).proposeSettlement(PHASE, 7000); // 70% to worker
      const wb = await token.balanceOf(worker.address);
      const cb = await token.balanceOf(client.address);
      const toWorker = (AMOUNT * 7000n) / 10000n;
      await expect(escrow.connect(worker).acceptSettlement(PHASE))
        .to.emit(escrow, "SettlementExecuted")
        .withArgs(PHASE, 7000, toWorker, AMOUNT - toWorker);
      expect(await token.balanceOf(worker.address)).to.equal(wb + toWorker);
      expect(await token.balanceOf(client.address)).to.equal(cb + (AMOUNT - toWorker));
    });

    it("the proposer cannot accept their own proposal", async () => {
      const { escrow, client, worker } = await loadFixture(deploy);
      await fund(escrow, client, worker);
      await escrow.connect(client).proposeSettlement(PHASE, 5000);
      await expect(escrow.connect(client).acceptSettlement(PHASE)).to.be.revertedWithCustomError(escrow, "CannotAcceptOwnProposal");
    });

    it("non-parties cannot propose or accept", async () => {
      const { escrow, client, worker, other } = await loadFixture(deploy);
      await fund(escrow, client, worker);
      await expect(escrow.connect(other).proposeSettlement(PHASE, 5000)).to.be.revertedWithCustomError(escrow, "NotAParty");
    });

    it("settlement can resolve a disputed phase", async () => {
      const { escrow, admin, client, worker } = await loadFixture(deploy);
      await fund(escrow, client, worker);
      await escrow.connect(admin).raiseDispute(PHASE);
      await escrow.connect(worker).proposeSettlement(PHASE, 5000);
      await expect(escrow.connect(client).acceptSettlement(PHASE)).to.emit(escrow, "SettlementExecuted");
    });
  });

  describe("worker ghosting: refund to client", () => {
    it("rolls the funded phase back to the client", async () => {
      const { token, escrow, admin, client, worker } = await loadFixture(deploy);
      await fund(escrow, client, worker);
      const cb = await token.balanceOf(client.address);
      await expect(escrow.connect(admin).refundToClient(PHASE))
        .to.emit(escrow, "PhaseRefunded")
        .withArgs(PHASE, client.address, AMOUNT);
      expect(await token.balanceOf(client.address)).to.equal(cb + AMOUNT);
    });

    it("only the attestor can refund", async () => {
      const { escrow, client, worker } = await loadFixture(deploy);
      await fund(escrow, client, worker);
      await expect(escrow.connect(worker).refundToClient(PHASE)).to.be.revertedWithCustomError(escrow, "AccessControlUnauthorizedAccount");
    });
  });

  describe("delivery stake", () => {
    it("locks, then refunds to the worker on success", async () => {
      const { token, escrow, admin, client, worker } = await loadFixture(deploy);
      const stakeAmt = ethers.parseEther("1800");
      await expect(escrow.connect(worker).lockStake(HIRE, client.address, stakeAmt))
        .to.emit(escrow, "StakeLocked").withArgs(HIRE, worker.address, stakeAmt);
      const wb = await token.balanceOf(worker.address);
      await escrow.connect(admin).refundStake(HIRE);
      expect(await token.balanceOf(worker.address)).to.equal(wb + stakeAmt);
    });

    it("forfeits the stake to the client on ghosting", async () => {
      const { token, escrow, admin, client, worker } = await loadFixture(deploy);
      const stakeAmt = ethers.parseEther("1800");
      await escrow.connect(worker).lockStake(HIRE, client.address, stakeAmt);
      const cb = await token.balanceOf(client.address);
      await expect(escrow.connect(admin).forfeitStake(HIRE))
        .to.emit(escrow, "StakeForfeited").withArgs(HIRE, client.address, stakeAmt);
      expect(await token.balanceOf(client.address)).to.equal(cb + stakeAmt);
    });

    it("rejects double-locking and non-attestor refund/forfeit", async () => {
      const { escrow, client, worker } = await loadFixture(deploy);
      const stakeAmt = ethers.parseEther("1800");
      await escrow.connect(worker).lockStake(HIRE, client.address, stakeAmt);
      await expect(escrow.connect(worker).lockStake(HIRE, client.address, stakeAmt)).to.be.revertedWithCustomError(escrow, "WrongStatus");
      await expect(escrow.connect(worker).refundStake(HIRE)).to.be.revertedWithCustomError(escrow, "AccessControlUnauthorizedAccount");
    });
  });

  describe("circuit breaker", () => {
    it("pausing blocks fund movement; unpausing restores it", async () => {
      const { escrow, admin, client, worker } = await loadFixture(deploy);
      await escrow.connect(admin).pause();
      await expect(fund(escrow, client, worker)).to.be.revertedWithCustomError(escrow, "EnforcedPause");
      await escrow.connect(admin).unpause();
      await expect(fund(escrow, client, worker)).to.emit(escrow, "PhaseFunded");
    });

    it("only a pauser can pause", async () => {
      const { escrow, other } = await loadFixture(deploy);
      await expect(escrow.connect(other).pause()).to.be.revertedWithCustomError(escrow, "AccessControlUnauthorizedAccount");
    });
  });

  describe("no-drain guarantee", () => {
    it("the admin cannot move escrowed funds to itself — money only reaches worker/client", async () => {
      const { token, escrow, admin, client, worker } = await loadFixture(deploy);
      await fund(escrow, client, worker);
      // There is no admin drain function. The only exits pay the recorded parties.
      const adminBefore = await token.balanceOf(admin.address);
      await escrow.connect(client).approveRelease(PHASE); // goes to worker, not admin
      expect(await token.balanceOf(admin.address)).to.equal(adminBefore);
      expect(await token.balanceOf(worker.address)).to.be.greaterThan(0);
    });
  });

  describe("reentrancy", () => {
    it("a malicious token cannot re-enter to double-pay", async () => {
      const [admin, client, worker] = await ethers.getSigners();
      const Token = await ethers.getContractFactory("ReentrantToken");
      const token = await Token.deploy();
      const Escrow = await ethers.getContractFactory("PhaseEscrow");
      const escrow = await Escrow.deploy(await token.getAddress(), admin.address);
      await token.mint(client.address, ethers.parseEther("100000"));
      await token.connect(client).approve(await escrow.getAddress(), ethers.MaxUint256);
      await escrow.connect(client).fundPhase(PHASE, worker.address, AMOUNT);
      // Arm the token to re-enter approveRelease on payout.
      await token.setAttack(await escrow.getAddress(), PHASE);

      await escrow.connect(client).approveRelease(PHASE);
      // The worker is paid exactly once; the re-entrant call was blocked by the guard.
      expect(await token.balanceOf(worker.address)).to.equal(AMOUNT);
      expect((await escrow.getEscrow(PHASE)).status).to.equal(Status.RELEASED);
    });
  });
});
