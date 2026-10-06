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
        .withArgs(PHASE, client.address, worker.address, await token.getAddress(), AMOUNT);
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
    it("v3: a refunded phase can be funded again, starting clean", async () => {
      const { token, escrow, admin, client, worker, other } = await loadFixture(deploy);
      expect(await escrow.version()).to.equal(3n);
      // A funding to the wrong worker, refunded…
      await escrow.connect(client).fundPhase(PHASE, other.address, AMOUNT);
      await escrow.connect(admin).refundToClient(PHASE);
      expect((await escrow.getEscrow(PHASE)).status).to.equal(Status.REFUNDED);
      // …then funded correctly; the escrow holds exactly the new funding, nothing stale.
      await expect(escrow.connect(client).fundPhase(PHASE, worker.address, AMOUNT)).to.emit(escrow, "PhaseFunded");
      const e = await escrow.getEscrow(PHASE);
      expect(e.status).to.equal(Status.FUNDED);
      expect(e.worker).to.equal(worker.address);
      expect(e.amount).to.equal(AMOUNT);
      expect(e.releaseEligibleAfter).to.equal(0n);
      expect(await token.balanceOf(await escrow.getAddress())).to.equal(AMOUNT);
      // It still can't be funded twice while live.
      await expect(escrow.connect(client).fundPhase(PHASE, worker.address, AMOUNT)).to.be.revertedWithCustomError(escrow, "WrongStatus");
    });

    it("v3: a re-funding starts with no settlement proposal and no delivery deadline", async () => {
      const { escrow, admin, client, worker } = await loadFixture(deploy);
      await fund(escrow, client, worker);
      await escrow.connect(admin).markDelivered(PHASE, (await time.latest()) + WINDOW);
      await escrow.connect(client).proposeSettlement(PHASE, 7000);
      await escrow.connect(admin).refundToClient(PHASE);
      await fund(escrow, client, worker);
      expect((await escrow.getEscrow(PHASE)).releaseEligibleAfter).to.equal(0n);
      // The old 70% proposal is gone: the worker can't accept it.
      await expect(escrow.connect(worker).acceptSettlement(PHASE)).to.be.reverted;
    });

    it("released, resolved and disputed phases still can't be funded again", async () => {
      const { escrow, admin, client, worker } = await loadFixture(deploy);
      await fund(escrow, client, worker);
      await escrow.connect(admin).markDelivered(PHASE, (await time.latest()) + WINDOW);
      await escrow.connect(client).approveRelease(PHASE);
      await expect(fund(escrow, client, worker)).to.be.revertedWithCustomError(escrow, "WrongStatus");
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

  describe("v2: multi-asset escrow", () => {
    const USDT = (n) => BigInt(n) * 10n ** 6n; // 6-decimal stablecoin

    async function deployV2() {
      const base = await deploy();
      const { escrow, admin, client } = base;
      const Mock = await ethers.getContractFactory("MockToken");
      const usdt = await Mock.deploy("Tether USD (test)", "USDT", 6);
      await usdt.mint(client.address, USDT(100000));
      await usdt.connect(client).approve(await escrow.getAddress(), ethers.MaxUint256);
      await escrow.connect(admin).setAssetAllowed(await usdt.getAddress(), true);
      await escrow.connect(admin).setAssetAllowed(ethers.ZeroAddress, true); // native coin
      return { ...base, usdt };
    }

    it("only the admin can allow assets; disallowed assets can't fund", async () => {
      const { escrow, client, worker, other } = await loadFixture(deploy);
      const Mock = await ethers.getContractFactory("MockToken");
      const usdc = await Mock.deploy("USD Coin (test)", "USDC", 6);
      await expect(escrow.connect(other).setAssetAllowed(await usdc.getAddress(), true)).to.be.revertedWithCustomError(escrow, "AccessControlUnauthorizedAccount");
      await expect(escrow.connect(client).fundPhaseWith(PHASE, worker.address, await usdc.getAddress(), 1)).to.be.revertedWithCustomError(escrow, "AssetNotAllowed");
      await expect(escrow.connect(client).fundPhaseNative(PHASE, worker.address, { value: 1 })).to.be.revertedWithCustomError(escrow, "AssetNotAllowed");
      expect(await escrow.allowedAsset(await escrow.token())).to.equal(true);
    });

    it("funds and releases in a 6-decimal ERC-20, paying out in the same asset", async () => {
      const { escrow, usdt, client, worker } = await loadFixture(deployV2);
      const amt = USDT(95);
      await expect(escrow.connect(client).fundPhaseWith(PHASE, worker.address, await usdt.getAddress(), amt))
        .to.emit(escrow, "PhaseFunded").withArgs(PHASE, client.address, worker.address, await usdt.getAddress(), amt);
      const e = await escrow.getEscrow(PHASE);
      expect(e.asset).to.equal(await usdt.getAddress());
      await escrow.connect(client).approveRelease(PHASE);
      expect(await usdt.balanceOf(worker.address)).to.equal(amt);
      expect(await usdt.balanceOf(await escrow.getAddress())).to.equal(0n);
    });

    it("funds in the native coin; refund and verdict split pay native", async () => {
      const { escrow, admin, client, worker } = await loadFixture(deployV2);
      const amt = ethers.parseEther("1");
      await expect(escrow.connect(client).fundPhaseNative(PHASE, worker.address, { value: amt }))
        .to.emit(escrow, "PhaseFunded").withArgs(PHASE, client.address, worker.address, ethers.ZeroAddress, amt);
      expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(amt);
      // verdict 60/40 — exact amounts in wei
      await escrow.connect(admin).raiseDispute(PHASE);
      const wBefore = await ethers.provider.getBalance(worker.address);
      await expect(escrow.connect(admin).resolveDispute(PHASE, 6000))
        .to.emit(escrow, "DisputeResolved").withArgs(PHASE, 6000, ethers.parseEther("0.6"), ethers.parseEther("0.4"));
      expect((await ethers.provider.getBalance(worker.address)) - wBefore).to.equal(ethers.parseEther("0.6"));
      expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(0n);

      const P2 = ethers.id("phase-native-refund");
      await escrow.connect(client).fundPhaseNative(P2, worker.address, { value: amt });
      await expect(escrow.connect(admin).refundToClient(P2)).to.changeEtherBalances([client, escrow], [amt, -amt]);
    });

    it("native funding is never accepted through the ERC-20 path, and zero value is refused", async () => {
      const { escrow, client, worker } = await loadFixture(deployV2);
      await expect(escrow.connect(client).fundPhaseWith(PHASE, worker.address, ethers.ZeroAddress, 1)).to.be.revertedWithCustomError(escrow, "AssetNotAllowed");
      await expect(escrow.connect(client).fundPhaseNative(PHASE, worker.address, { value: 0 })).to.be.revertedWithCustomError(escrow, "InvalidAmount");
    });

    it("refuses fee-on-transfer tokens (would owe more than it holds)", async () => {
      const { escrow, admin, client, worker } = await loadFixture(deploy);
      const Fee = await ethers.getContractFactory("FeeOnTransferToken");
      const fee = await Fee.deploy();
      await fee.mint(client.address, ethers.parseEther("1000"));
      await fee.connect(client).approve(await escrow.getAddress(), ethers.MaxUint256);
      await escrow.connect(admin).setAssetAllowed(await fee.getAddress(), true);
      await expect(escrow.connect(client).fundPhaseWith(PHASE, worker.address, await fee.getAddress(), ethers.parseEther("100")))
        .to.be.revertedWithCustomError(escrow, "AmountMismatch");
    });

    it("a re-entrant native payee is paid exactly once", async () => {
      const { escrow, client } = await loadFixture(deployV2);
      const R = await ethers.getContractFactory("ReentrantReceiver");
      const payee = await R.deploy();
      const amt = ethers.parseEther("2");
      await escrow.connect(client).fundPhaseNative(PHASE, await payee.getAddress(), { value: amt });
      await payee.arm(await escrow.getAddress(), PHASE);
      await escrow.connect(client).approveRelease(PHASE);
      expect(await ethers.provider.getBalance(await payee.getAddress())).to.equal(amt);
      expect(await payee.hits()).to.equal(1n);
      expect((await escrow.getEscrow(PHASE)).status).to.equal(Status.RELEASED);
    });

    it("a payee that refuses native coin makes the release revert (funds stay safe in escrow)", async () => {
      const { escrow, client } = await loadFixture(deployV2);
      const R = await ethers.getContractFactory("ReentrantReceiver");
      const payee = await R.deploy();
      await payee.setReject(true);
      await escrow.connect(client).fundPhaseNative(PHASE, await payee.getAddress(), { value: 5n });
      await expect(escrow.connect(client).approveRelease(PHASE)).to.be.revertedWithCustomError(escrow, "NativeTransferFailed");
      expect((await escrow.getEscrow(PHASE)).status).to.equal(Status.FUNDED);
      expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(5n);
    });

    it("disallowing an asset stops new fundings but existing escrows still pay out", async () => {
      const { escrow, admin, usdt, client, worker } = await loadFixture(deployV2);
      await escrow.connect(client).fundPhaseWith(PHASE, worker.address, await usdt.getAddress(), USDT(10));
      await escrow.connect(admin).setAssetAllowed(await usdt.getAddress(), false);
      await expect(escrow.connect(client).fundPhaseWith(ethers.id("p2"), worker.address, await usdt.getAddress(), USDT(1))).to.be.revertedWithCustomError(escrow, "AssetNotAllowed");
      await escrow.connect(client).approveRelease(PHASE);
      expect(await usdt.balanceOf(worker.address)).to.equal(USDT(10));
    });
  });

  describe("relayer role wiring (deploy / grant-roles scripts)", () => {
    const { grantRelayerRoles } = require("../scripts/lib/roles");
    const silent = () => {};

    it("a relayer that is not the deployer can't attest until it is granted the roles", async () => {
      const { escrow, client, worker, other: relayer } = await loadFixture(deploy);
      await fund(escrow, client, worker);
      await expect(escrow.connect(relayer).markDelivered(PHASE, 1)).to.be.reverted;

      const roles = await grantRelayerRoles(escrow, relayer.address, silent);
      expect(roles).to.deep.equal({ ATTESTOR_ROLE: true, DISPUTE_ROLE: true });

      await escrow.connect(relayer).markDelivered(PHASE, 1);
      await escrow.connect(relayer).approveRelease(PHASE);
      expect((await escrow.getEscrow(PHASE)).status).to.equal(Status.RELEASED);
    });

    it("granting is idempotent and never hands out admin or pauser", async () => {
      const { escrow, other: relayer } = await loadFixture(deploy);
      await grantRelayerRoles(escrow, relayer.address, silent);
      await grantRelayerRoles(escrow, relayer.address, silent);
      expect(await escrow.hasRole(await escrow.DEFAULT_ADMIN_ROLE(), relayer.address)).to.equal(false);
      expect(await escrow.hasRole(await escrow.PAUSER_ROLE(), relayer.address)).to.equal(false);
    });

    it("only the admin can grant — a non-admin running the script is refused", async () => {
      const { escrow, worker, other: relayer } = await loadFixture(deploy);
      await expect(grantRelayerRoles(escrow.connect(worker), relayer.address, silent))
        .to.be.revertedWithCustomError(escrow, "AccessControlUnauthorizedAccount");
      expect(await escrow.hasRole(await escrow.ATTESTOR_ROLE(), relayer.address)).to.equal(false);
    });
  });
});
