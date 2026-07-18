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
    },
  },
};
