const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const { grantRelayerRoles } = require("./lib/roles");

/*
  Deploys the test stablecoin + PhaseEscrow and writes the addresses + ABI location
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

  // On a real testnet you'd point at an existing stablecoin. For Amoy/local we
  // deploy the mock so the whole flow is exercisable end to end.
  const Token = await hre.ethers.getContractFactory("MockStablecoin");
  const token = await Token.deploy();
  await token.waitForDeployment();
  const tokenAddr = await token.getAddress();
  console.log("MockStablecoin:", tokenAddr);

  const Escrow = await hre.ethers.getContractFactory("PhaseEscrow");
  const escrow = await Escrow.deploy(tokenAddr, deployer.address);
  await escrow.waitForDeployment();
  const escrowAddr = await escrow.getAddress();
  console.log("PhaseEscrow:  ", escrowAddr);

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
    contracts: { MockStablecoin: tokenAddr, PhaseEscrow: escrowAddr },
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
