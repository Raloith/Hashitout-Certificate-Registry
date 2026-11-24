// Local test on an in-memory Ganache chain: deploys the contract and checks every refusal.
const ganache = require('ganache'); const { ethers } = require('ethers');
const art = require('../artifacts/CertificateRegistry.json');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m); } };
async function expectRevert(p, msg) {
  try { const tx = await p; await tx.wait(); ok(false, 'should refuse: ' + msg); }
  catch (e) { const all = (e.reason || '') + ' ' + JSON.stringify(e.info || {}) + ' ' + e.message; ok(all.includes(msg), `refused: "${msg}"`); }
}
(async () => {
  const server = ganache.server({ logging: { quiet: true }, chain: { hardfork: 'shanghai' } });
  await server.listen(8547);
  const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8547');
  const [admin, club, stranger, club2] = await Promise.all([0,1,2,3].map(i => provider.getSigner(i)));
  const f = new ethers.ContractFactory(art.abi, art.bytecode, admin);
  const c = await f.deploy(); await c.waitForDeployment();
  console.log('Deployed at', await c.getAddress());
  ok((await c.admin()) === await admin.getAddress(), 'deployer is admin');
  await expectRevert(c.connect(stranger).addIssuer(await stranger.getAddress(), 'Fake'), 'Only the admin can manage issuers');
  await (await c.addIssuer(await club.getAddress(), 'Coding Club')).wait();
  await (await c.addIssuer(await club2.getAddress(), 'Robotics Club')).wait();
  ok(await c.isIssuer(await club.getAddress()), 'club added as issuer');
  await expectRevert(c.connect(stranger).issue('C-1042', 'S-001', 'Workshop'), 'Only an authorized issuer can post');
  await (await c.connect(club).issue('C-1042', 'S-001', 'Intro to Solidity Workshop - Participant')).wait();
  ok((await c.versionCount('C-1042')) === 1n, 'issued: 1 version');
  await expectRevert(c.connect(club).issue('C-1042', 'S-002', 'x'), 'Certificate code already exists');
  await expectRevert(c.connect(club).correct('C-9999', 'x', 'y'), 'Certificate not found');
  await expectRevert(c.connect(club2).correct('C-1042', 'x', 'y'), 'Only the original issuer can correct this');
  await (await c.connect(club).correct('C-1042', 'Intro to Solidity Workshop - Winner', 'Wrong award typed')).wait();
  const v1 = await c.getVersion('C-1042', 1);
  ok(v1.status === 1n && v1.holderId === 'S-001' && v1.title.endsWith('Winner'), 'correction is version 1, holder kept');
  ok((await c.getVersion('C-1042', 0)).title.endsWith('Participant'), 'original version still there');
  await (await c.connect(club).revoke('C-1042', 'Issued by mistake')).wait();
  ok((await c.versionCount('C-1042')) === 3n, 'revoke adds version 3');
  await expectRevert(c.connect(club).correct('C-1042', 'x', 'y'), 'Certificate is revoked');
  await expectRevert(c.connect(club).revoke('C-1042', 'again'), 'Certificate is revoked');
  await (await c.removeIssuer(await club.getAddress())).wait();
  await expectRevert(c.connect(club).issue('C-2000', 'S-003', 'x'), 'Only an authorized issuer can post');
  ok((await c.versionCount('C-1042')) === 3n, 'removed issuer: old certificate history still visible');
  console.log(`\n${pass} passed, ${fail} failed`); await server.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
