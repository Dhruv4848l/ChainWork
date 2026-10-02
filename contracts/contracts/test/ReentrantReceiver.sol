// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IEscrowV2 {
    function approveRelease(bytes32 phaseId) external;
    function refundToClient(bytes32 phaseId) external;
}

/*
  Test-only payee for NATIVE-coin escrows. On receiving coin it tries to re-enter the
  escrow (to be paid twice). With `reject` set it refuses payment instead. Proves the
  ReentrancyGuard covers native payouts and that a failed native payout reverts cleanly.
*/
contract ReentrantReceiver {
    address public escrow;
    bytes32 public phaseId;
    bool public reject;
    uint256 public hits;

    function arm(address escrow_, bytes32 phaseId_) external {
        escrow = escrow_;
        phaseId = phaseId_;
    }

    function setReject(bool r) external {
        reject = r;
    }

    receive() external payable {
        if (reject) revert("no thanks");
        hits++;
        if (escrow != address(0) && hits == 1) {
            // Swallow the guard's revert so the outer payout itself still succeeds.
            try IEscrowV2(escrow).approveRelease(phaseId) {} catch {}
        }
    }
}
