const test = require('ava');

const { ethers, upgrades } = require('hardhat');

test.before(async t => {
  t.context.Greeter = await ethers.getContractFactory('Greeter');
  t.context.GreeterProxiable = await ethers.getContractFactory('GreeterProxiable');
});

test('load transparent proxy from loadProxy', async t => {
  const { Greeter } = t.context;
  const greeter = await upgrades.deployProxy(Greeter, ['Hello, Hardhat!'], { kind: 'transparent' });
  const loaded = await upgrades.loadProxy(greeter.address, greeter.signer);
  t.is(await loaded.greet(), 'Hello, Hardhat!');
});

test('load transparent proxy from loadProxy with factory', async t => {
  const { Greeter } = t.context;
  const greeter = await upgrades.deployProxy(Greeter, ['Hello, Hardhat!'], { kind: 'transparent' });
  const loaded = await upgrades.loadProxy(greeter);
  t.is(await loaded.greet(), 'Hello, Hardhat!');
});

test('load uups proxy from loadProxy', async t => {
  const { GreeterProxiable } = t.context;
  const greeter = await upgrades.deployProxy(GreeterProxiable, ['Hello, Hardhat!'], { kind: 'uups' });
  const loaded = await upgrades.loadProxy(greeter.address, greeter.signer);
  t.is(await loaded.greet(), 'Hello, Hardhat!');
});

test('load uups proxy from loadProxy with factory', async t => {
  const { GreeterProxiable } = t.context;
  const greeter = await upgrades.deployProxy(GreeterProxiable, ['Hello, Hardhat!'], { kind: 'uups' });
  const loaded = await upgrades.loadProxy(greeter.address, greeter.signer);
  t.is(await loaded.greet(), 'Hello, Hardhat!');
});
