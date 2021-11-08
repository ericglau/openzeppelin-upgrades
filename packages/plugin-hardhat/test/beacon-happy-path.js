const test = require('ava');

const { ethers, upgrades } = require('hardhat');

test.before(async t => {
  t.context.Greeter = await ethers.getContractFactory('Greeter');
  t.context.GreeterV2 = await ethers.getContractFactory('GreeterV2');
  t.context.GreeterV3 = await ethers.getContractFactory('GreeterV3');
});

test('happy path', async t => {
  const { Greeter, GreeterV2, GreeterV3 } = t.context;

  const greeterBeacon = await upgrades.deployBeacon(Greeter); 
  const greeter = await upgrades.deployBeaconProxy(greeterBeacon, Greeter, ['Hello, Hardhat!']);
  await greeter.deployed();
  t.is(await greeter.greet(), 'Hello, Hardhat!');

  const greeterAltProxy = await upgrades.deployBeaconProxy(greeterBeacon, Greeter.signer, ['Hello, Hardhat 2!']);
  await greeterAltProxy.deployed();
  t.is(await greeterAltProxy.greet(), 'Hello, Hardhat 2!');

  // new impl 
  await upgrades.upgradeBeacon(greeterBeacon, GreeterV2);  

  // reload proxy to work with the new contract
  const greeter2 = await upgrades.reloadBeaconProxy(greeter);
  t.is(await greeter2.greet(), 'Hello, Hardhat!');
  await greeter2.resetGreeting();
  t.is(await greeter2.greet(), 'Hello World');

  // reload proxy to work with the new contract
  const greeterAlt2 = await upgrades.reloadBeaconProxy(greeterAltProxy);
  t.is(await greeterAlt2.greet(), 'Hello, Hardhat 2!');
  await greeterAlt2.resetGreeting();
  t.is(await greeterAlt2.greet(), 'Hello World');
});
