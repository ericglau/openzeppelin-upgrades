const test = require('ava');

const { ethers, upgrades } = require('hardhat');

test.before(async t => {
  t.context.Greeter = await ethers.getContractFactory('ERC20_V1');
  t.context.GreeterV2 = await ethers.getContractFactory('ERC20_V2');
});

test('happy path', async t => {
  const { Greeter, GreeterV2 } = t.context;

  const greeter = await upgrades.deployProxy(Greeter, [], { kind: 'uups' });

  console.log('name ' + await greeter.name());


  const greeter2 = await upgrades.upgradeProxy(greeter, GreeterV2);
  await greeter2.waitForDeployment();
  await greeter2.resetName();

  console.log('name ' + await greeter2.name());
});
