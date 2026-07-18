// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface IReenterable {
    function approveRelease(bytes32 phaseId) external;
}

/*
  A malicious ERC-20 used ONLY in tests: on every `transfer` it tries to re-enter
  the escrow's approveRelease for a target phase. The escrow's ReentrancyGuard must
  make that re-entrant call revert, proving funds can't be drained via reentrancy.
*/
contract ReentrantToken is ERC20 {
    address public target;
    bytes32 public phaseId;
    bool private _attacking;

    constructor() ERC20("Reentrant", "RE") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setAttack(address target_, bytes32 phaseId_) external {
        target = target_;
        phaseId = phaseId_;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        // When the escrow pays out (transfers FROM the escrow contract), try to re-enter.
        if (target != address(0) && from == target && !_attacking) {
            _attacking = true;
            // This should revert inside the guarded escrow; swallow so the outer tx
            // surfaces the guard's revert rather than ours.
            try IReenterable(target).approveRelease(phaseId) {} catch {}
            _attacking = false;
        }
    }
}
