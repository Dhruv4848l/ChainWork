// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/*
  MockToken — a configurable test ERC-20 standing in for USDT / USDC (6 decimals) on the
  local chain and testnets (payment plan P6). Open mint — TESTNET / LOCAL ONLY.
*/
contract MockToken is ERC20 {
    uint8 private immutable _dec;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _dec = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _dec;
    }

    /// Anyone can mint in this test token — do NOT ship this to mainnet.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
