/*
  Relayer role wiring, shared by deploy.js and grant-roles.js.

  The app's backend signs every attestor / dispute call with ONE relayer account
  (index CHAIN_RELAYER_INDEX of CHAIN_MNEMONIC in the app's .env). The contract's
  constructor gives every role to the deployer, so unless the relayer IS the deployer
  it must be granted ATTESTOR_ROLE + DISPUTE_ROLE, or every markDelivered / approve /
  autoRelease / raiseDispute / resolveDispute / refund reverts. (That was the state of
  the first Amoy deployment.)
*/
const RELAYER_ROLES = ["ATTESTOR_ROLE", "DISPUTE_ROLE"];

async function grantRelayerRoles(escrow, relayer, log = console.log) {
  const result = {};
  for (const name of RELAYER_ROLES) {
    const role = await escrow[name]();
    if (await escrow.hasRole(role, relayer)) {
      log(`  ${name}: already granted to ${relayer}`);
    } else {
      const tx = await escrow.grantRole(role, relayer);
      await tx.wait();
      log(`  ${name}: granted to ${relayer} (tx ${tx.hash})`);
    }
    result[name] = await escrow.hasRole(role, relayer);
  }
  return result;
}

module.exports = { RELAYER_ROLES, grantRelayerRoles };
