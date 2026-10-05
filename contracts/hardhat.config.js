require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/*
  ChainWork contracts — Hardhat config.

  We build and test everything on Hardhat's built-in local network (free, instant),
  and deploy to the Polygon Amoy TESTNET only. NEVER a mainnet network here — the
  money layer stays on testnet until a professional third-party audit is done.

  Amoy deploy needs two env vars in contracts/.env (see .env.example):
    AMOY_RPC_URL   — an Amoy JSON-RPC endpoint
    DEPLOYER_KEY   — a THROWAWAY test wallet's private key (never one with real funds)
*/
const AMOY_RPC_URL = process.env.AMOY_RPC_URL || "https://rpc-amoy.polygon.technology";
const DEPLOYER_KEY = process.env.DEPLOYER_KEY;

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: {},
    amoy: {
      url: AMOY_RPC_URL,
      chainId: 80002,
      accounts: DEPLOYER_KEY ? [DEPLOYER_KEY] : [],
      // Amoy's RPC often suggests a 150+ gwei tip while the base fee is ~0; cap the price
      // (e.g. AMOY_GAS_PRICE_GWEI=35) so a deploy costs what the network really needs.
      ...(process.env.AMOY_GAS_PRICE_GWEI ? { gasPrice: Math.round(Number(process.env.AMOY_GAS_PRICE_GWEI) * 1e9) } : {}),
    },
  },
};
