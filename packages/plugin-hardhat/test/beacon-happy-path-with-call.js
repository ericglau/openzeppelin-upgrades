const test = require('ava');

const { ethers, upgrades } = require('hardhat');

test.before(async t => {
  t.context.Greeter = await ethers.getContractFactory('Greeter');
  t.context.GreeterV2 = await ethers.getContractFactory('GreeterV2');
});

test('happy path - call with args', async t => {
  const { Greeter, GreeterV2 } = t.context;

  const greeter = await upgrades.deployProxy(Greeter, ['Hello, Hardhat!'], { kind: 'beacon' });

  t.is(await greeter.greet(), 'Hello, Hardhat!');

  try {
    await upgrades.upgradeProxy(greeter, GreeterV2, {
      call: { fn: 'setGreeting', args: ['Called during upgrade'] }
    });
    t.fail("Expected an error due to function call during beacon implementation upgrade");
  } catch (e) {
  }
});

test('happy path - call without args', async t => {
  const { Greeter, GreeterV2 } = t.context;

  const greeter = await upgrades.deployProxy(Greeter, ['Hello, Hardhat!'], { kind: 'beacon' });

  t.is(await greeter.greet(), 'Hello, Hardhat!');

  try {
    await upgrades.upgradeProxy(greeter, GreeterV2, {
      call: 'resetGreeting'
    });
    t.fail("Expected an error due to function call during beacon implementation upgrade");
  } catch (e) {
  }
});
