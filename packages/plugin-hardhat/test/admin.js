const test = require('ava');

const { ethers, upgrades } = require('hardhat');

test.before(async t => {
  t.context.Greeter = await ethers.getContractFactory('Greeter');
});

test('deployProxyAdmin', async t => {
  const { Greeter } = t.context;

  await t.throwsAsync(upgrades.admin.getInstance(), undefined, 'No ProxyAdmin was found in the network manifest');


  const signer = (await ethers.getSigners())[1];
  const deployedAdminAddress2 = await upgrades.deployProxyAdmin(signer);

  // t.is(deployedAdminAddress2, deployedAdminAddress);

  const adminInstance = await upgrades.admin.getInstance();

  // const greeter = await upgrades.deployProxy(Greeter, ['Hola admin!'], { kind: 'transparent' });

  t.is(await adminInstance.getAddress(), deployedAdminAddress2);
});
