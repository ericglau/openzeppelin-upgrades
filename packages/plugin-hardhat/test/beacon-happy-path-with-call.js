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

  // TODO test for an error?

  await upgrades.upgradeProxy(greeter, GreeterV2, {
    call: { fn: 'setGreeting', args: ['Called during upgrade'] }
  });

  // beacon does not support upgradeToAndCall()
  t.is(await greeter.greet(), 'Hello, Hardhat!');
});

test('happy path - call without args', async t => {
  const { Greeter, GreeterV2 } = t.context;

  const greeter = await upgrades.deployProxy(Greeter, ['Hello, Hardhat!'], { kind: 'beacon' });

  t.is(await greeter.greet(), 'Hello, Hardhat!');

  // TODO test for an error?

  await upgrades.upgradeProxy(greeter, GreeterV2, {
    call: 'resetGreeting'
  });

  // beacon does not support upgradeToAndCall()
  t.is(await greeter.greet(), 'Hello, Hardhat!');
});
