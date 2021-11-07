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
  const greeter = await upgrades.deployBeaconProxy(Greeter, greeterBeacon, {
    call: { fn: 'setGreeting', args: ['Hello, Hardhat!'] }
  });
  await greeter.deployed();

  t.is(await greeter.greet(), 'Hello, Hardhat!');

  // new impl 
  await upgrades.upgradeBeacon(greeterBeacon, GreeterV2);
  t.is(await greeter.greet(), 'Hello, Hardhat!');
  

  const greeter2 = await GreeterV2.attach(greeter.address);
  await greeter2.resetGreeting();
  t.is(await greeter2.greet(), 'Hello World');
/*
  // new beacon
  const greeterBeacon3 = await upgrades.deployBeacon(GreeterV3);
  await upgrades.upgradeBeaconProxy(greeter, greeterBeacon3, {
    call: { fn: 'setGreeting', args: ['Called during upgrade'] }
  });
  t.is(await greeter.greet(), 'Called during upgrade');
  t.is(await greeter.version(), 'V3');*/
});
