const test = require('ava');

const { ethers, upgrades } = require('hardhat');

test.before(async t => {
  t.context.Greeter = await ethers.getContractFactory('Greeter');
  t.context.GreeterV2 = await ethers.getContractFactory('GreeterV2');
  t.context.GreeterV3 = await ethers.getContractFactory('GreeterV3');
});

test('block beacon upgrade via upgradeProxy', async t => {
  const { Greeter, GreeterV2, GreeterV3 } = t.context;

  const greeter = await upgrades.deployProxy(Greeter, ['Hello, Hardhat!'], { kind: 'beacon' });

  try {
    const greeter2 = await upgrades.upgradeProxy(greeter, GreeterV2);
    t.fail("upgradeProxy() should not allow a beacon proxy to be upgraded");
  } catch (e) {
  }

  try {
    const greeter3ImplAddr = await upgrades.prepareUpgrade(greeter.address, GreeterV3);
    t.fail("prepareUpgrade() should not allow a beacon proxy to be prepared for upgrade");
  } catch (e) {
  }
});
