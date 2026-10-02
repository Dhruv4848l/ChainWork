const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const { grantRelayerRoles } = require("./lib/roles");

/*
  Deploys the test stablecoin + PhaseEscrow (v2, multi-asset) + test USDT / USDC and writes the addresses + ABI location
  to deployments/<network>.json so Phase 7 can wire the app to them.

  Local dry run:   npx hardhat run scripts/deploy.js
  Amoy testnet:    RELAYER_ADDRESS=0x… npm run deploy:amoy   (needs contracts/.env — see .env.example)

  RELAYER_ADDRESS is the app relayer (account CHAIN_RELAYER_INDEX of the app's
  CHAIN_MNEMONIC); it gets ATTESTOR_ROLE + DISPUTE_ROLE. Defaults to the deployer.
*/
async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const net = hre.network.name;
  console.log(`Deploying to "${net}" as ${deployer.address}`);

  // On a real testnet you'd point at an existing stablecoin. For Amoy/local we deploy the
  // mock so the whole flow is exercisable end to end — or reuse one already deployed
  // (EXISTING_TOKEN_ADDRESS=0x…, e.g. the cwINR from an earlier deploy) to save gas.
  let tokenAddr;
  if (process.env.EXISTING_TOKEN_ADDRESS) {
    tokenAddr = hre.ethers.getAddress(process.env.EXISTING_TOKEN_ADDRESS);
    if ((await hre.ethers.provider.getCode(tokenAddr)) === "0x") throw new Error(`No contract at EXISTING_TOKEN_ADDRESS ${tokenAddr}.`);
    const existing = await hre.ethers.getContractAt("MockStablecoin", tokenAddr);
    console.log(`MockStablecoin: ${tokenAddr} (reused — ${await existing.symbol()}, ${await existing.decimals()} decimals)`);
  } else {
    const Token = await hre.ethers.getContractFactory("MockStablecoin");
    const token = await Token.deploy();
    await token.waitForDeployment();
    tokenAddr = await token.getAddress();
    console.log("MockStablecoin:", tokenAddr);
  }

  const Escrow = await hre.ethers.getContractFactory("PhaseEscrow");
  const escrow = await Escrow.deploy(tokenAddr, deployer.address);
  await escrow.waitForDeployment();
  const escrowAddr = await escrow.getAddress();
  console.log("PhaseEscrow:  ", escrowAddr);

  // v2 (payment plan P6): test USDT / USDC (6 decimals) and the native coin, allowlisted
  // alongside the stablecoin. On mainnet these would be the real token addresses instead.
  const Mock = await hre.ethers.getContractFactory("MockToken");
  const extra = {};
  for (const [symbol, name] of [["USDT", "Tether USD (test)"], ["USDC", "USD Coin (test)"]]) {
    const t = await Mock.deploy(name, symbol, 6);
    await t.waitForDeployment();
    extra[symbol] = await t.getAddress();
    await (await escrow.setAssetAllowed(extra[symbol], true)).wait();
    console.log(`Mock${symbol}:      `, extra[symbol]);
  }
  await (await escrow.setAssetAllowed(hre.ethers.ZeroAddress, true)).wait();
  console.log("Native coin:    allowed");

  // The app's relayer signs every attestor/dispute call. If it isn't the deployer
  // (it shouldn't be off the local node), hand it the roles now — otherwise every
  // escrow operation after funding reverts.
  const relayer = process.env.RELAYER_ADDRESS || deployer.address;
  console.log(`\nRelayer roles for ${relayer}:`);
  const relayerRoles = await grantRelayerRoles(escrow, relayer);

  const out = {
    network: net,
    chainId: Number((await hre.ethers.provider.getNetwork()).chainId),
    deployer: deployer.address,
    relayer,
    relayerRoles,
    contracts: { MockStablecoin: tokenAddr, PhaseEscrow: escrowAddr, MockUSDT: extra.USDT, MockUSDC: extra.USDC },
    abiPath: "contracts/artifacts/contracts/PhaseEscrow.sol/PhaseEscrow.json",
    deployedAt: new Date().toISOString(),
  };
  const dir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${net}.json`), JSON.stringify(out, null, 2));
  console.log(`\nWrote deployments/${net}.json`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
