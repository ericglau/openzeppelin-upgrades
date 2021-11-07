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

  // test it with updated ABI
  const greeter2 = await GreeterV2.attach(greeter.address);
  t.is(await greeter2.greet(), 'Hello, Hardhat!');
  await greeter2.resetGreeting();
  t.is(await greeter2.greet(), 'Hello World');

});
