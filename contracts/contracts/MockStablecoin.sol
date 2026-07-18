// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/*
  MockStablecoin — a test ERC-20 standing in for the rupee-pegged stablecoin used to
  denominate wages. FOR TESTNET / LOCAL TESTS ONLY. It has an open `mint` so tests
  (and a testnet faucet flow) can hand out balances freely; a real deployment would
  use an actual regulated stablecoin, never this.
*/
contract MockStablecoin is ERC20 {
    constructor() ERC20("ChainWork Test Rupee", "cwINR") {}

    /// Anyone can mint in this test token — do NOT ship this to mainnet.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
