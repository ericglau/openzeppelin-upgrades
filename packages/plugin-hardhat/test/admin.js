const test = require('ava');

const { ethers, upgrades } = require('hardhat');

test.before(async t => {
  t.context.Greeter = await ethers.getContractFactory('Greeter');
});

test('deployProxyAdmin', async t => {
  const { Greeter } = t.context;

  await t.throwsAsync(upgrades.admin.getInstance(), undefined, 'No ProxyAdmin was found in the network manifest');

  const deployedAdminAddress = await upgrades.deployProxyAdmin();

  // deploys new admin
  const signer = (await ethers.getSigners())[1];
  const deployedAdminAddress2 = await upgrades.deployProxyAdmin(signer);

  t.not(deployedAdminAddress2, deployedAdminAddress);

  // deploys new admin
  const greeter = await upgrades.deployProxy(Greeter, ['Hola admin!'], { kind: 'transparent' });
  const adminAddress = await upgrades.erc1967.getAdminAddress(await greeter.getAddress());

  t.not(adminAddress, deployedAdminAddress);
  t.not(adminAddress, deployedAdminAddress2);
});
