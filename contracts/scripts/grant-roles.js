const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const { grantRelayerRoles } = require("./lib/roles");

/*
  Grant the app's relayer ATTESTOR_ROLE + DISPUTE_ROLE on an EXISTING PhaseEscrow.
  Run it with the deployer (admin) key — the only account allowed to grant roles.

    RELAYER_ADDRESS=0x…  [ESCROW_ADDRESS=0x…]  npx hardhat run scripts/grant-roles.js --network amoy

  RELAYER_ADDRESS = the address of account CHAIN_RELAYER_INDEX derived from the app's
  CHAIN_MNEMONIC (the app's /api/health/chain endpoint prints it).
  ESCROW_ADDRESS defaults to deployments/<network>.json.
  The relayer also needs gas: send it test POL from a faucet.
*/
async function main() {
  const net = hre.network.name;
  const relayer = process.env.RELAYER_ADDRESS;
  if (!relayer || !hre.ethers.isAddress(relayer)) {
    throw new Error("Set RELAYER_ADDRESS to the app relayer's address (see /api/health/chain).");
  }

  let escrowAddr = process.env.ESCROW_ADDRESS;
  if (!escrowAddr) {
    const file = path.join(__dirname, "..", "deployments", `${net}.json`);
    if (!fs.existsSync(file)) throw new Error(`No ESCROW_ADDRESS and no ${file}.`);
    escrowAddr = JSON.parse(fs.readFileSync(file, "utf8")).contracts.PhaseEscrow;
  }

  const [admin] = await hre.ethers.getSigners();
  const escrow = await hre.ethers.getContractAt("PhaseEscrow", escrowAddr);
  const adminRole = await escrow.DEFAULT_ADMIN_ROLE();
  if (!(await escrow.hasRole(adminRole, admin.address))) {
    throw new Error(`${admin.address} is not DEFAULT_ADMIN on ${escrowAddr} — use the deployer key.`);
  }

  console.log(`Granting relayer roles on ${escrowAddr} ("${net}") as ${admin.address}`);
  const roles = await grantRelayerRoles(escrow, relayer);

  const gas = await hre.ethers.provider.getBalance(relayer);
  console.log(`\nRelayer ${relayer}`);
  console.log(`  roles: ${JSON.stringify(roles)}`);
  console.log(`  gas:   ${hre.ethers.formatEther(gas)} (native)`);
  if (gas < hre.ethers.parseEther("0.1")) {
    console.log("  ⚠  Low gas — fund the relayer from a faucet before switching PAYMENT_MODE=testnet.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
