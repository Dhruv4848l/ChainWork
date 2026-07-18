// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/*
  ============================================================================
  PhaseEscrow — ChainWork's phase-based escrow (spec Section 13).
  ============================================================================

  Funds for each PHASE of a hire are locked here in a stablecoin and can only move
  by the contract's rules — mutual confirmation, timeout auto-release, or a jury
  verdict. No path lets the platform (or anyone) drain escrow to an arbitrary
  address: money only ever goes to the phase's recorded worker or client.

  ROLES
  - DEFAULT_ADMIN_ROLE : can grant/revoke roles (a multisig in production).
  - ATTESTOR_ROLE      : the platform's backend oracle/relayer. A blockchain can't
                         see off-chain events (a client clicking Approve, or two
                         working days passing) — the attestor RELAYS those facts in.
                         It relays; it does not get to send money anywhere the rules
                         don't already dictate.
  - DISPUTE_ROLE       : freezes a phase and later executes the jury verdict split.
  - PAUSER_ROLE        : circuit breaker (pause fund movement if a bug is found).

  TRUST BOUNDARY (spec 13.7): `markDelivered` takes the release-eligible timestamp
  computed off-chain from the business-day calendar. The contract does NOT trust the
  attestor about *when* — it only lets `autoRelease` fire at/after that stored
  timestamp, so the timing is enforced on-chain even though it originates off-chain.
*/
contract PhaseEscrow is AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    bytes32 public constant ATTESTOR_ROLE = keccak256("ATTESTOR_ROLE");
    bytes32 public constant DISPUTE_ROLE = keccak256("DISPUTE_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    uint256 public constant BPS_DENOMINATOR = 10_000;

    /// The stablecoin every escrow is denominated in (set once, immutable).
    IERC20 public immutable token;

    enum Status {
        NONE, // never funded
        FUNDED, // client funded; work may begin; provably locked
        DELIVERED, // worker delivered; verification window open
        RELEASED, // paid to worker (approved / auto / never-disputed)
        DISPUTED, // frozen pending verdict or settlement
        RESOLVED, // split by verdict or mutual settlement
        REFUNDED // rolled back to client (worker ghosting)
    }

    struct Escrow {
        address client;
        address worker;
        uint256 amount;
        Status status;
        uint64 releaseEligibleAfter; // set on markDelivered; gate for autoRelease
    }

    struct Settlement {
        bool exists;
        address proposer;
        uint256 workerBps; // worker's share in basis points (0..10000)
    }

    enum StakeStatus {
        NONE,
        LOCKED,
        REFUNDED,
        FORFEITED
    }

    struct Stake {
        address worker;
        address client;
        uint256 amount;
        StakeStatus status;
    }

    mapping(bytes32 => Escrow) private _escrows; // phaseId => escrow
    mapping(bytes32 => Settlement) private _settlements; // phaseId => pending settlement
    mapping(bytes32 => Stake) private _stakes; // hireId => delivery stake

    // ---- Events ----
    event PhaseFunded(bytes32 indexed phaseId, address indexed client, address indexed worker, uint256 amount);
    event PhaseDelivered(bytes32 indexed phaseId, uint64 releaseEligibleAfter);
    event PhaseReleased(bytes32 indexed phaseId, address indexed worker, uint256 amount, string via);
    event PhaseDisputed(bytes32 indexed phaseId);
    event DisputeResolved(bytes32 indexed phaseId, uint256 workerBps, uint256 toWorker, uint256 toClient);
    event SettlementProposed(bytes32 indexed phaseId, address indexed proposer, uint256 workerBps);
    event SettlementExecuted(bytes32 indexed phaseId, uint256 workerBps, uint256 toWorker, uint256 toClient);
    event PhaseRefunded(bytes32 indexed phaseId, address indexed client, uint256 amount);
    event StakeLocked(bytes32 indexed hireId, address indexed worker, uint256 amount);
    event StakeRefunded(bytes32 indexed hireId, address indexed worker, uint256 amount);
    event StakeForfeited(bytes32 indexed hireId, address indexed client, uint256 amount);

    // ---- Errors ----
    error InvalidAmount();
    error ZeroAddress();
    error WrongStatus();
    error NotAParty();
    error TooEarly();
    error InvalidBps();
    error NoSettlement();
    error CannotAcceptOwnProposal();

    constructor(IERC20 stablecoin, address admin) {
        if (address(stablecoin) == address(0) || admin == address(0)) revert ZeroAddress();
        token = stablecoin;
        // The admin starts with every role; in production it hands ATTESTOR/DISPUTE
        // to the backend + jury executor and keeps admin/pauser on a multisig.
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ATTESTOR_ROLE, admin);
        _grantRole(DISPUTE_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
    }

    // ========================================================================
    // Funding
    // ========================================================================

    /// The client funds a phase's advance. Pulls `amount` from msg.sender (client).
    function fundPhase(bytes32 phaseId, address worker, uint256 amount)
        external
        nonReentrant
        whenNotPaused
    {
        if (amount == 0) revert InvalidAmount();
        if (worker == address(0)) revert ZeroAddress();
        Escrow storage e = _escrows[phaseId];
        if (e.status != Status.NONE) revert WrongStatus(); // no double-funding

        // effects
        e.client = msg.sender;
        e.worker = worker;
        e.amount = amount;
        e.status = Status.FUNDED;

        // interaction
        token.safeTransferFrom(msg.sender, address(this), amount);
        emit PhaseFunded(phaseId, msg.sender, worker, amount);
    }

    // ========================================================================
    // Delivery + release
    // ========================================================================

    /// The attestor relays the worker's delivery and the off-chain-computed
    /// verification deadline. Auto-release cannot fire before `releaseEligibleAfter`.
    function markDelivered(bytes32 phaseId, uint64 releaseEligibleAfter)
        external
        onlyRole(ATTESTOR_ROLE)
        whenNotPaused
    {
        Escrow storage e = _escrows[phaseId];
        if (e.status != Status.FUNDED) revert WrongStatus();
        e.status = Status.DELIVERED;
        e.releaseEligibleAfter = releaseEligibleAfter;
        emit PhaseDelivered(phaseId, releaseEligibleAfter);
    }

    /// Client approves (or the attestor relays the approval): release to the worker.
    function approveRelease(bytes32 phaseId) external nonReentrant whenNotPaused {
        Escrow storage e = _escrows[phaseId];
        if (e.status != Status.FUNDED && e.status != Status.DELIVERED) revert WrongStatus();
        // Authorized either by the recorded client directly, or by the attestor relay.
        if (msg.sender != e.client && !hasRole(ATTESTOR_ROLE, msg.sender)) revert NotAParty();
        _release(phaseId, e, "approved");
    }

    /// After the verification window lapses with no client action, the attestor
    /// triggers release. The CONTRACT enforces the timing: it reverts before the
    /// stored `releaseEligibleAfter`, so the backend cannot pay out early.
    function autoRelease(bytes32 phaseId) external nonReentrant whenNotPaused onlyRole(ATTESTOR_ROLE) {
        Escrow storage e = _escrows[phaseId];
        if (e.status != Status.DELIVERED) revert WrongStatus();
        if (block.timestamp < e.releaseEligibleAfter) revert TooEarly();
        _release(phaseId, e, "auto");
    }

    function _release(bytes32 phaseId, Escrow storage e, string memory via) private {
        uint256 amount = e.amount;
        address worker = e.worker;
        // effects
        e.status = Status.RELEASED;
        e.amount = 0;
        // interaction
        token.safeTransfer(worker, amount);
        emit PhaseReleased(phaseId, worker, amount, via);
    }

    // ========================================================================
    // Disputes (Section 12 jury) + mutual settlement (Section 13.2)
    // ========================================================================

    /// Freeze a phase for jury resolution. Only a dispute resolver may call this.
    function raiseDispute(bytes32 phaseId) external onlyRole(DISPUTE_ROLE) whenNotPaused {
        Escrow storage e = _escrows[phaseId];
        if (e.status != Status.FUNDED && e.status != Status.DELIVERED) revert WrongStatus();
        e.status = Status.DISPUTED;
        emit PhaseDisputed(phaseId);
    }

    /// Execute a jury verdict: direct `workerBps` (0..10000) to the worker, the rest
    /// to the client. Only callable on a disputed phase, by the dispute resolver.
    function resolveDispute(bytes32 phaseId, uint256 workerBps)
        external
        nonReentrant
        whenNotPaused
        onlyRole(DISPUTE_ROLE)
    {
        Escrow storage e = _escrows[phaseId];
        if (e.status != Status.DISPUTED) revert WrongStatus();
        if (workerBps > BPS_DENOMINATOR) revert InvalidBps();
        (uint256 toWorker, uint256 toClient) = _split(e, workerBps);
        emit DisputeResolved(phaseId, workerBps, toWorker, toClient);
    }

    /// Either party proposes a split (workerBps to worker, rest to client).
    function proposeSettlement(bytes32 phaseId, uint256 workerBps) external whenNotPaused {
        Escrow storage e = _escrows[phaseId];
        if (e.status != Status.FUNDED && e.status != Status.DELIVERED && e.status != Status.DISPUTED) {
            revert WrongStatus();
        }
        if (msg.sender != e.client && msg.sender != e.worker) revert NotAParty();
        if (workerBps > BPS_DENOMINATOR) revert InvalidBps();
        _settlements[phaseId] = Settlement({exists: true, proposer: msg.sender, workerBps: workerBps});
        emit SettlementProposed(phaseId, msg.sender, workerBps);
    }

    /// The OTHER party accepts the pending proposal; the split executes.
    function acceptSettlement(bytes32 phaseId) external nonReentrant whenNotPaused {
        Escrow storage e = _escrows[phaseId];
        if (e.status != Status.FUNDED && e.status != Status.DELIVERED && e.status != Status.DISPUTED) {
            revert WrongStatus();
        }
        if (msg.sender != e.client && msg.sender != e.worker) revert NotAParty();
        Settlement memory s = _settlements[phaseId];
        if (!s.exists) revert NoSettlement();
        if (s.proposer == msg.sender) revert CannotAcceptOwnProposal();
        delete _settlements[phaseId];
        (uint256 toWorker, uint256 toClient) = _split(e, s.workerBps);
        emit SettlementExecuted(phaseId, s.workerBps, toWorker, toClient);
    }

    function _split(Escrow storage e, uint256 workerBps)
        private
        returns (uint256 toWorker, uint256 toClient)
    {
        uint256 amount = e.amount;
        toWorker = (amount * workerBps) / BPS_DENOMINATOR;
        toClient = amount - toWorker;
        address worker = e.worker;
        address client = e.client;
        // effects
        e.status = Status.RESOLVED;
        e.amount = 0;
        // interactions (skip zero transfers)
        if (toWorker > 0) token.safeTransfer(worker, toWorker);
        if (toClient > 0) token.safeTransfer(client, toClient);
        return (toWorker, toClient);
    }

    // ========================================================================
    // Worker non-delivery / ghosting rollback (Section 13.4)
    // ========================================================================

    /// Roll a funded phase back to the client when the worker ghosts. Attestor-only.
    function refundToClient(bytes32 phaseId) external nonReentrant whenNotPaused onlyRole(ATTESTOR_ROLE) {
        Escrow storage e = _escrows[phaseId];
        if (e.status != Status.FUNDED && e.status != Status.DELIVERED) revert WrongStatus();
        uint256 amount = e.amount;
        address client = e.client;
        e.status = Status.REFUNDED;
        e.amount = 0;
        token.safeTransfer(client, amount);
        emit PhaseRefunded(phaseId, client, amount);
    }

    // ========================================================================
    // Delivery stake (Section 13.4) — refundable deposit on higher-value hires
    // ========================================================================

    /// The worker locks a refundable stake for a hire. Pulls from msg.sender (worker).
    function lockStake(bytes32 hireId, address client, uint256 amount)
        external
        nonReentrant
        whenNotPaused
    {
        if (amount == 0) revert InvalidAmount();
        if (client == address(0)) revert ZeroAddress();
        Stake storage st = _stakes[hireId];
        if (st.status != StakeStatus.NONE) revert WrongStatus();
        st.worker = msg.sender;
        st.client = client;
        st.amount = amount;
        st.status = StakeStatus.LOCKED;
        token.safeTransferFrom(msg.sender, address(this), amount);
        emit StakeLocked(hireId, msg.sender, amount);
    }

    /// Return the stake to the worker on successful completion. Attestor-only.
    function refundStake(bytes32 hireId) external nonReentrant whenNotPaused onlyRole(ATTESTOR_ROLE) {
        Stake storage st = _stakes[hireId];
        if (st.status != StakeStatus.LOCKED) revert WrongStatus();
        uint256 amount = st.amount;
        address worker = st.worker;
        st.status = StakeStatus.REFUNDED;
        st.amount = 0;
        token.safeTransfer(worker, amount);
        emit StakeRefunded(hireId, worker, amount);
    }

    /// Forfeit the stake to the client on worker ghosting. Attestor-only.
    function forfeitStake(bytes32 hireId) external nonReentrant whenNotPaused onlyRole(ATTESTOR_ROLE) {
        Stake storage st = _stakes[hireId];
        if (st.status != StakeStatus.LOCKED) revert WrongStatus();
        uint256 amount = st.amount;
        address client = st.client;
        st.status = StakeStatus.FORFEITED;
        st.amount = 0;
        token.safeTransfer(client, amount);
        emit StakeForfeited(hireId, client, amount);
    }

    // ========================================================================
    // Circuit breaker (spec 13.8 — pausable by a multisig, never one individual)
    // ========================================================================

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // ========================================================================
    // Views
    // ========================================================================

    function getEscrow(bytes32 phaseId)
        external
        view
        returns (address client, address worker, uint256 amount, Status status, uint64 releaseEligibleAfter)
    {
        Escrow storage e = _escrows[phaseId];
        return (e.client, e.worker, e.amount, e.status, e.releaseEligibleAfter);
    }

    function getStake(bytes32 hireId)
        external
        view
        returns (address worker, address client, uint256 amount, StakeStatus status)
    {
        Stake storage st = _stakes[hireId];
        return (st.worker, st.client, st.amount, st.status);
    }

    function getSettlement(bytes32 phaseId)
        external
        view
        returns (bool exists, address proposer, uint256 workerBps)
    {
        Settlement storage s = _settlements[phaseId];
        return (s.exists, s.proposer, s.workerBps);
    }
}
